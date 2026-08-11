import { Injectable, NotFoundException } from '@nestjs/common';
import type { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/database/prisma.service.js';

export interface YeniBildirim {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  occurrenceId?: string | undefined;
  metadata?: Prisma.InputJsonValue | undefined;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    query: {
      unreadOnly?: boolean | undefined;
      cursor?: string | undefined;
      limit: number;
    },
  ) {
    const where = {
      userId,
      ...(query.unreadOnly === true ? { readAt: null } : {}),
    };

    const rows = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
      ...(query.cursor !== undefined
        ? { cursor: { id: query.cursor }, skip: 1 }
        : {}),
    });

    const hasMore = rows.length > query.limit;
    const data = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      data: data.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        metadata: row.metadata,
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? (data.at(-1)?.id ?? null) : null,
      hasMore,
    };
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  async markRead(userId: string, id: string): Promise<void> {
    // `updateMany` kullanılıyor ki `userId` koşulu sorguya gömülü olsun:
    // başkasının bildirimini okundu işaretlemek mümkün olmasın.
    const sonuc = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });

    if (sonuc.count === 0) {
      // Zaten okunmuş olabilir; o da başarı sayılıyor, yoksa iki kez tıklayan
      // kullanıcı hata görürdü.
      const var_ = await this.prisma.notification.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (var_ === null) {
        throw new NotFoundException('Bildirim bulunamadı');
      }
    }
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  /**
   * Bildirimi **yalnızca yoksa** oluşturuyor; oluşturduysa `true` dönüyor.
   *
   * Tekillik veritabanı kısıtına bırakılıyor (`userId, type, occurrenceId`).
   * "Önce sorgula, yoksa yaz" deseni iki iş aynı anda koştuğunda ikisi de
   * "yok" görüp ikisi de yazar; kullanıcı aynı hatırlatmayı iki kez alır.
   * Kısıt ihlalini yakalamak bu yarışı kapatıyor.
   *
   * Dönüş değeri önemli: e-posta yalnızca **gerçekten yeni** bildirim için
   * gönderiliyor.
   */
  async createIfAbsent(bildirim: YeniBildirim): Promise<boolean> {
    try {
      await this.prisma.notification.create({
        data: {
          userId: bildirim.userId,
          type: bildirim.type,
          title: bildirim.title,
          body: bildirim.body,
          ...(bildirim.occurrenceId !== undefined
            ? { occurrenceId: bildirim.occurrenceId }
            : {}),
          ...(bildirim.metadata !== undefined
            ? { metadata: bildirim.metadata }
            : {}),
        },
      });
      return true;
    } catch (hata) {
      if (tekillikIhlali(hata)) {
        return false;
      }
      throw hata;
    }
  }
}

/** Prisma'nın tekil kısıt ihlali kodu. */
function tekillikIhlali(hata: unknown): boolean {
  return (
    typeof hata === 'object' &&
    hata !== null &&
    'code' in hata &&
    (hata as { code: unknown }).code === 'P2002'
  );
}
