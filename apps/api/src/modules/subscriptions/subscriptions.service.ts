import { Injectable, NotFoundException } from '@nestjs/common';
import {
  annualizedMinor,
  monthlyEquivalentMinor,
  nextOccurrence,
  occurrencesBetween,
  toCalendarDate,
  toISODate,
  type BillingCycle,
} from '@abonelik/shared';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { scopeTo } from '../../infra/database/scoped.repository.js';
import { OccurrenceService, today } from './occurrence.service.js';
import type {
  CreateSubscriptionInput,
  ListQuery,
  UpdateSubscriptionInput,
} from './subscriptions.dto.js';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly occurrences_: OccurrenceService,
  ) {}

  async list(userId: string, query: ListQuery) {
    const scope = scopeTo(this.prisma, userId);
    const where = buildWhere(query);

    // Cursor sayfalama: offset'te araya kayıt girdiğinde sayfalar kayıyor ve
    // kullanıcı aynı kaydı iki kez görüyor ya da hiç görmüyor.
    const rows = await scope.findMany({
      where,
      orderBy: buildOrderBy(query),
      take: query.limit + 1,
      ...(query.cursor !== undefined
        ? { cursor: { id: query.cursor }, skip: 1 }
        : {}),
    });

    const hasMore = rows.length > query.limit;
    const data = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      data: data.map(toDto),
      nextCursor: hasMore ? (data.at(-1)?.id ?? null) : null,
      hasMore,
    };
  }

  async findOne(userId: string, id: string) {
    const row = await scopeTo(this.prisma, userId).findById(id);
    if (row === null) {
      // Yok da olabilir, başkasınınki de. Ayrımı söylemiyoruz.
      throw new NotFoundException('Abonelik bulunamadı');
    }
    return toDto(row);
  }

  async create(userId: string, input: CreateSubscriptionInput) {
    const scope = scopeTo(this.prisma, userId);
    await this.assertCategoryUsable(userId, input.categoryId);
    const startDate = toCalendarDate(new Date(input.startDate));
    const spec = {
      cycle: input.billingCycle,
      customIntervalDays: input.customIntervalDays,
    };

    const row = await scope.create({
      name: input.name,
      categoryId: input.categoryId,
      priceMinor: BigInt(input.priceMinor),
      currency: input.currency,
      billingCycle: input.billingCycle,
      startDate,
      nextPaymentDate: nextOccurrence(startDate, spec, today()),
      ...optional(input),
    });

    await this.occurrences_.syncFor(row.id);
    return toDto(row);
  }

  async update(userId: string, id: string, input: UpdateSubscriptionInput) {
    const scope = scopeTo(this.prisma, userId);

    const mevcut = await scope.findById(id);
    if (mevcut === null) {
      throw new NotFoundException('Abonelik bulunamadı');
    }
    if (input.categoryId !== undefined) {
      await this.assertCategoryUsable(userId, input.categoryId);
    }

    const startDate =
      input.startDate !== undefined
        ? toCalendarDate(new Date(input.startDate))
        : mevcut.startDate;
    const cycle = input.billingCycle ?? mevcut.billingCycle;
    const interval =
      input.customIntervalDays ?? mevcut.customIntervalDays ?? undefined;

    await scope.update(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.categoryId !== undefined
        ? { categoryId: input.categoryId }
        : {}),
      ...(input.priceMinor !== undefined
        ? { priceMinor: BigInt(input.priceMinor) }
        : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.billingCycle !== undefined ? { billingCycle: cycle } : {}),
      ...(input.customIntervalDays !== undefined
        ? { customIntervalDays: input.customIntervalDays }
        : {}),
      ...(input.startDate !== undefined ? { startDate } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.reminderEnabled !== undefined
        ? { reminderEnabled: input.reminderEnabled }
        : {}),
      ...(input.reminderDaysBefore !== undefined
        ? { reminderDaysBefore: input.reminderDaysBefore }
        : {}),
      ...(input.lastUsedAt !== undefined
        ? { lastUsedAt: toCalendarDate(new Date(input.lastUsedAt)) }
        : {}),
      nextPaymentDate: nextOccurrence(
        startDate,
        { cycle, customIntervalDays: interval },
        today(),
        mevcut.endDate,
      ),
    });

    await this.occurrences_.syncFor(id);
    return this.findOne(userId, id);
  }

  /**
   * İptal — silme **değil**.
   *
   * Geçmiş korunuyor: kullanıcı "geçen yıl neye ne kadar ödedim" sorusunu
   * hâlâ sorabilmeli. Gelecekteki beklenen ödemeler siliniyor ki hatırlatma
   * gelmesin.
   */
  async cancel(userId: string, id: string) {
    const scope = scopeTo(this.prisma, userId);
    const ok = await scope.update(id, {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      nextPaymentDate: null,
    });
    if (!ok) {
      throw new NotFoundException('Abonelik bulunamadı');
    }
    await this.occurrences_.clearFuture(id);
    return this.findOne(userId, id);
  }

  async pause(userId: string, id: string) {
    const ok = await scopeTo(this.prisma, userId).update(id, {
      status: 'PAUSED',
      // Ne zaman duraklatıldığı kaydediliyor: harcama analizi "bu abonelik
      // ne zamana kadar ödendi" sorusunu tahminle değil veriyle cevaplasın.
      pausedAt: new Date(),
      nextPaymentDate: null,
    });
    if (!ok) {
      throw new NotFoundException('Abonelik bulunamadı');
    }
    await this.occurrences_.clearFuture(id);
    return this.findOne(userId, id);
  }

  async resume(userId: string, id: string) {
    const scope = scopeTo(this.prisma, userId);
    const mevcut = await scope.findById(id);
    if (mevcut === null) {
      throw new NotFoundException('Abonelik bulunamadı');
    }

    await scope.update(id, {
      status: 'ACTIVE',
      pausedAt: null,
      nextPaymentDate: nextOccurrence(
        mevcut.startDate,
        {
          cycle: mevcut.billingCycle,
          customIntervalDays: mevcut.customIntervalDays ?? undefined,
        },
        today(),
        mevcut.endDate,
      ),
    });

    await this.occurrences_.syncFor(id);
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const ok = await scopeTo(this.prisma, userId).delete(id);
    if (!ok) {
      throw new NotFoundException('Abonelik bulunamadı');
    }
  }

  async occurrences(userId: string, id: string) {
    const rows = await scopeTo(this.prisma, userId).occurrences(id);
    return rows.map((row) => ({
      id: row.id,
      dueDate: toISODate(row.dueDate),
      amountMinor: Number(row.amountMinor),
      currency: row.currency,
      status: row.status,
    }));
  }

  /**
   * Kategori bu kullanıcı için kullanılabilir mi?
   *
   * Yabancı anahtar kısıtı yalnızca "kategori var mı" diye bakıyor; **kimin**
   * kategorisi olduğuna bakmıyor. Bu denetim olmadan kullanıcı, aboneliğini
   * başkasının özel kategorisine bağlayabiliyor ve yanıt gövdesinde o
   * kategorinin adını görebiliyordu — küçük ama gerçek bir sızıntı.
   *
   * Sistem kategorileri (`userId = null`) herkese açık, o yüzden OR koşulu.
   */
  private async assertCategoryUsable(
    userId: string,
    categoryId: string,
  ): Promise<void> {
    const kategori = await this.prisma.category.findFirst({
      where: { id: categoryId, OR: [{ userId: null }, { userId }] },
      select: { id: true },
    });
    if (kategori === null) {
      // Başkasının kategorisi ile hiç olmayan kategori aynı yanıtı alıyor.
      throw new NotFoundException('Kategori bulunamadı');
    }
  }

}

function optional(input: CreateSubscriptionInput) {
  return {
    ...(input.providerId !== undefined ? { providerId: input.providerId } : {}),
    ...(input.description !== undefined
      ? { description: input.description }
      : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.customIntervalDays !== undefined
      ? { customIntervalDays: input.customIntervalDays }
      : {}),
    ...(input.endDate !== undefined
      ? { endDate: toCalendarDate(new Date(input.endDate)) }
      : {}),
    ...(input.trialEndsAt !== undefined
      ? { trialEndsAt: toCalendarDate(new Date(input.trialEndsAt)) }
      : {}),
    ...(input.paymentMethod !== undefined
      ? { paymentMethod: input.paymentMethod }
      : {}),
    ...(input.reminderEnabled !== undefined
      ? { reminderEnabled: input.reminderEnabled }
      : {}),
    ...(input.reminderDaysBefore !== undefined
      ? { reminderDaysBefore: input.reminderDaysBefore }
      : {}),
  };
}

type Row = Awaited<ReturnType<ScopedFind>>;
type ScopedFind = () => Promise<
  NonNullable<Awaited<ReturnType<ReturnType<typeof scopeTo>['findById']>>>
>;

function toDto(row: Row) {
  const priceMinor = Number(row.priceMinor);
  const spec = {
    priceMinor,
    cycle: row.billingCycle as BillingCycle,
    ...(row.customIntervalDays !== null
      ? { customIntervalDays: row.customIntervalDays }
      : {}),
  };

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    notes: row.notes,
    priceMinor,
    currency: row.currency,
    billingCycle: row.billingCycle,
    customIntervalDays: row.customIntervalDays,
    // Türetilmiş değerler sunucuda hesaplanıyor: istemci para matematiğini
    // tekrar etmesin, iki taraf ayrışmasın.
    monthlyEquivalentMinor: monthlyEquivalentMinor(spec),
    yearlyMinor: annualizedMinor(spec),
    startDate: toISODate(row.startDate),
    nextPaymentDate:
      row.nextPaymentDate !== null ? toISODate(row.nextPaymentDate) : null,
    endDate: row.endDate !== null ? toISODate(row.endDate) : null,
    trialEndsAt: row.trialEndsAt !== null ? toISODate(row.trialEndsAt) : null,
    lastUsedAt: row.lastUsedAt !== null ? toISODate(row.lastUsedAt) : null,
    status: row.status,
    paymentMethod: row.paymentMethod,
    reminderEnabled: row.reminderEnabled,
    reminderDaysBefore: row.reminderDaysBefore,
    category: { id: row.category.id, name: row.category.name },
    provider:
      row.provider !== null
        ? {
            id: row.provider.id,
            name: row.provider.name,
            logoUrl: row.provider.logoUrl,
            color: row.provider.color,
          }
        : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function buildWhere(query: ListQuery) {
  return {
    ...(query.q !== undefined
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' as const } },
            { description: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(query.categoryId !== undefined ? { categoryId: query.categoryId } : {}),
    ...(query.status !== undefined ? { status: query.status } : {}),
    ...(query.billingCycle !== undefined
      ? { billingCycle: query.billingCycle }
      : {}),
    ...(query.currency !== undefined ? { currency: query.currency } : {}),
    ...(query.minPriceMinor !== undefined || query.maxPriceMinor !== undefined
      ? {
          priceMinor: {
            ...(query.minPriceMinor !== undefined
              ? { gte: BigInt(query.minPriceMinor) }
              : {}),
            ...(query.maxPriceMinor !== undefined
              ? { lte: BigInt(query.maxPriceMinor) }
              : {}),
          },
        }
      : {}),
    ...(query.nextPaymentBefore !== undefined
      ? { nextPaymentDate: { lte: new Date(query.nextPaymentBefore) } }
      : {}),
  };
}

function buildOrderBy(query: ListQuery) {
  return { [query.sort]: query.order };
}
