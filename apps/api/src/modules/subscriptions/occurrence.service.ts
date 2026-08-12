import { Injectable } from '@nestjs/common';
import { occurrencesBetween, toCalendarDate } from '@abonelik/shared';
import { PrismaService } from '../../infra/database/prisma.service.js';

/**
 * Beklenen ödemelerin kaç gün ileriye kadar üretileceği.
 *
 * Sonsuza kadar üretmek tabloyu şişirir; çok kısa tutmak hatırlatma işinin
 * kaçırmasına yol açar. 60 gün, en uzun hatırlatma penceresinin (kullanıcı en
 * fazla 30 gün önceden uyarı isteyebiliyor) rahatça iki katı.
 */
export const HORIZON_DAYS = 60;

/**
 * Beklenen ödeme kayıtlarının üretimi.
 *
 * Ayrı bir servis çünkü **iki yerden** çağrılıyor: kullanıcı bir aboneliği
 * değiştirdiğinde ve her gece günlük iş bütün abonelikleri taradığında. Aynı
 * mantığın iki kopyası zamanla ayrışır; ayrıştığında da fark "hatırlatma
 * gelmedi" olarak, yani sessizce ortaya çıkar.
 */
@Injectable()
export class OccurrenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ufuk boyunca beklenen ödemeleri üretiyor ve kaç yeni kayıt eklendiğini
   * döndürüyor.
   *
   * `createMany` + `skipDuplicates`: aynı ödeme iki kez üretilmeye
   * çalışılırsa veritabanı kısıtı zaten engelliyor, `skipDuplicates` de
   * hatayı sessizce yutuyor. Bu, işin **idempotent** olmasını sağlıyor —
   * aynı anda iki kez çalışsa bile sonuç aynı.
   */
  async syncFor(subscriptionId: string, bugun = today()): Promise<number> {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });
    // Silinmiş aboneliğe ödeme üretmek, geri getirilmediği sürece
    // görünmeyecek kayıtlar biriktirmek olurdu.
    if (sub === null || sub.status !== 'ACTIVE' || sub.deletedAt !== null) {
      return 0;
    }

    const ufuk = new Date(bugun.getTime() + HORIZON_DAYS * 86_400_000);

    const tarihler = occurrencesBetween(
      sub.startDate,
      {
        cycle: sub.billingCycle,
        customIntervalDays: sub.customIntervalDays ?? undefined,
      },
      bugun,
      ufuk,
      sub.endDate,
    );

    if (tarihler.length === 0) {
      return 0;
    }

    const sonuc = await this.prisma.subscriptionOccurrence.createMany({
      data: tarihler.map((dueDate: Date) => ({
        subscriptionId,
        dueDate,
        // Tutar o günkü fiyattan kopyalanıyor: fiyat sonradan değişse bile
        // geçmiş ödemeler bozulmuyor.
        amountMinor: sub.priceMinor,
        currency: sub.currency,
      })),
      skipDuplicates: true,
    });

    return sonuc.count;
  }

  /** Gelecekteki planlanmış ödemeleri siliyor; geçmiş kayıtlara dokunmuyor. */
  async clearFuture(subscriptionId: string): Promise<void> {
    await this.prisma.subscriptionOccurrence.deleteMany({
      where: {
        subscriptionId,
        status: 'SCHEDULED',
        dueDate: { gte: today() },
      },
    });
  }
}

export function today(): Date {
  return toCalendarDate(new Date());
}
