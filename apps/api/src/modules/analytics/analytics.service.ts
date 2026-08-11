import { Injectable } from '@nestjs/common';
import {
  type BillingCycle,
  daysBetween,
  monthlyEquivalentMinor,
  occurrencesBetween,
  toCalendarDate,
  toISODate,
} from '@abonelik/shared';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { today } from '../subscriptions/occurrence.service.js';

/**
 * Harcama analizi.
 *
 * ## Sayılar nereden geliyor
 *
 * Beklenen ödeme kayıtları (`subscription_occurrences`) **geçmişi
 * kapsamıyor**: kayıtlar aboneliğin uygulamaya eklendiği günden ileriye
 * doğru üretiliyor. Ocak'ta başlamış bir aboneliği Ağustos'ta eklediyseniz
 * tabloda Ocak–Temmuz arası hiçbir satır yok; yıllık bir abonelikte ise ilk
 * ödeme 60 günlük ufkun ötesinde kaldığı için **hiç** satır olmayabiliyor.
 *
 * Bu yüzden takvim, saklanan satırlardan değil **fatura döngüsünden**
 * hesaplanıyor (`occurrencesBetween`, çapadan). Kayıt varsa tutar oradan
 * okunuyor — o satır ödemenin o günkü fiyatını taşıyor. Kayıt yoksa bugünkü
 * fiyat kullanılıyor.
 *
 * **Bilinen sınır:** fiyatı sonradan değişmiş bir aboneliğin, kayıt
 * bulunmayan geçmiş dönemleri bugünkü fiyatla hesaplanıyor. Geçmiş fiyat
 * hiçbir yerde saklanmadığı için daha iyisi mümkün değil; uydurmak yerine
 * belirtiyoruz.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async spending(
    userId: string,
    query: { from: string; to: string; groupBy: 'month' | 'category' },
  ) {
    const from = toCalendarDate(new Date(query.from));
    const to = toCalendarDate(new Date(query.to));

    const odemeler = await this.odemeleriHesapla(userId, from, to);

    return {
      from: toISODate(from),
      to: toISODate(to),
      groupBy: query.groupBy,
      // Toplam her zaman para birimi başına: farklı para birimlerini kurları
      // bilmeden toplamak uydurma bir sayı üretir (ADR-0007).
      totals: paraBirimiToplami(odemeler),
      buckets:
        query.groupBy === 'month'
          ? ayaGore(odemeler)
          : kategoriyeGore(odemeler),
    };
  }

  /**
   * Uzun süredir kullanılmayan abonelikler.
   *
   * `lastUsedAt` boşsa "hiç işaretlenmemiş" demek, "kullanılmıyor" demek
   * değil. Yine de listeye giriyor — çünkü asıl soru "neyi boşuna
   * ödüyorum" ve hiç işaretlenmemiş eski bir abonelik tam da o sorunun
   * adayı. Ayrımı istemciye bırakıyoruz: `lastUsedAt: null` gönderiliyor ve
   * arayüz bunu "hiç işaretlenmedi" diye gösteriyor.
   *
   * Dünkü abonelik listeye girmiyor: eşik `createdAt` için de geçerli.
   */
  async unused(userId: string, thresholdDays: number) {
    const bugun = today();
    const esik = new Date(bugun.getTime() - thresholdDays * 86_400_000);

    const abonelikler = await this.prisma.subscription.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        OR: [
          { lastUsedAt: { lt: esik } },
          { lastUsedAt: null, createdAt: { lt: esik } },
        ],
      },
      include: { category: { select: { id: true, name: true } } },
    });

    return abonelikler
      .map((sub) => {
        const aylik = monthlyEquivalentMinor(cycleInput(sub));
        const referans = sub.lastUsedAt ?? sub.createdAt;

        return {
          id: sub.id,
          name: sub.name,
          category: { id: sub.category.id, name: sub.category.name },
          priceMinor: Number(sub.priceMinor),
          currency: sub.currency,
          billingCycle: sub.billingCycle,
          monthlyEquivalentMinor: aylik,
          lastUsedAt:
            sub.lastUsedAt !== null ? toISODate(toCalendarDate(sub.lastUsedAt)) : null,
          // Kaç gündür dokunulmadığı. `lastUsedAt` boşsa eklendiğinden beri.
          idleDays: daysBetween(toCalendarDate(referans), bugun),
          // Bu abonelik böyle giderse yılda ne kadar tutuyor: kararı
          // kolaylaştıran sayı bu, aylık olan değil.
          wastedPerYearMinor: aylik * 12,
        };
      })
      .sort((a, b) => b.wastedPerYearMinor - a.wastedPerYearMinor);
  }

  /**
   * Aralıktaki bütün ödemeleri, abonelik takvimlerinden hesaplıyor.
   *
   * Her abonelik için o aralıkta gerçekten ödeme yapılıp yapılmadığını
   * belirleyen bir "etkin bitiş" var: iptal edilmişse iptal tarihi,
   * duraklatılmışsa duraklatma tarihi, süresi dolmuşsa bitiş tarihi.
   * Bunlar olmadan iptal edilmiş bir abonelik sonsuza kadar ödeniyormuş gibi
   * görünürdü.
   */
  private async odemeleriHesapla(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<Odeme[]> {
    const abonelikler = await this.prisma.subscription.findMany({
      where: { userId },
      include: { category: { select: { id: true, name: true } } },
    });

    if (abonelikler.length === 0) {
      return [];
    }

    // Kayıtlı tutarlar tek sorguda: kayıt varsa o günkü fiyatı taşıyor.
    const kayitlar = await this.prisma.subscriptionOccurrence.findMany({
      where: {
        subscription: { userId },
        dueDate: { gte: from, lte: to },
      },
      select: {
        subscriptionId: true,
        dueDate: true,
        amountMinor: true,
        currency: true,
      },
    });

    const kayitEslemesi = new Map<string, { amountMinor: bigint; currency: string }>();
    for (const kayit of kayitlar) {
      kayitEslemesi.set(
        `${kayit.subscriptionId}|${toISODate(toCalendarDate(kayit.dueDate))}`,
        { amountMinor: kayit.amountMinor, currency: kayit.currency },
      );
    }

    const odemeler: Odeme[] = [];

    for (const sub of abonelikler) {
      const bitis = etkinBitis(sub);
      const tarihler = occurrencesBetween(
        sub.startDate,
        {
          cycle: sub.billingCycle as BillingCycle,
          customIntervalDays: sub.customIntervalDays ?? undefined,
        },
        from,
        bitis !== null && bitis.getTime() < to.getTime() ? bitis : to,
      );

      for (const tarih of tarihler) {
        const kayit = kayitEslemesi.get(`${sub.id}|${toISODate(tarih)}`);
        odemeler.push({
          dueDate: tarih,
          amountMinor: Number(kayit?.amountMinor ?? sub.priceMinor),
          currency: kayit?.currency ?? sub.currency,
          categoryId: sub.category.id,
          categoryName: sub.category.name,
        });
      }
    }

    return odemeler;
  }
}

interface Odeme {
  dueDate: Date;
  amountMinor: number;
  currency: string;
  categoryId: string;
  categoryName: string;
}

/**
 * Aboneliğin ödemelerinin bittiği tarih; hâlâ ödeniyorsa `null`.
 *
 * Duraklatma tarihi olmadan duraklatılmış abonelikleri tahmin etmek
 * gerekiyordu; bu yüzden `pausedAt` şemaya eklendi.
 */
function etkinBitis(sub: {
  status: string;
  endDate: Date | null;
  cancelledAt: Date | null;
  pausedAt: Date | null;
}): Date | null {
  const adaylar: Date[] = [];

  if (sub.endDate !== null) {
    adaylar.push(toCalendarDate(sub.endDate));
  }
  if (sub.status === 'CANCELLED' && sub.cancelledAt !== null) {
    adaylar.push(toCalendarDate(sub.cancelledAt));
  }
  if (sub.status === 'PAUSED' && sub.pausedAt !== null) {
    adaylar.push(toCalendarDate(sub.pausedAt));
  }

  if (adaylar.length === 0) {
    return null;
  }
  // En erken olan geçerli: hangisi önce geldiyse ödemeler orada durmuştur.
  return adaylar.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b));
}

function cycleInput(sub: {
  priceMinor: bigint;
  billingCycle: string;
  customIntervalDays: number | null;
}) {
  return {
    priceMinor: Number(sub.priceMinor),
    cycle: sub.billingCycle as BillingCycle,
    ...(sub.customIntervalDays !== null
      ? { customIntervalDays: sub.customIntervalDays }
      : {}),
  };
}

function paraBirimiToplami(odemeler: Odeme[]) {
  const gruplar = new Map<string, number>();
  for (const odeme of odemeler) {
    gruplar.set(
      odeme.currency,
      (gruplar.get(odeme.currency) ?? 0) + odeme.amountMinor,
    );
  }
  return [...gruplar]
    .map(([currency, totalMinor]) => ({ currency, totalMinor }))
    .sort((a, b) => b.totalMinor - a.totalMinor);
}

function ayaGore(odemeler: Odeme[]) {
  const gruplar = new Map<string, { period: string; currency: string; totalMinor: number; count: number }>();

  for (const odeme of odemeler) {
    const period = toISODate(odeme.dueDate).slice(0, 7);
    const anahtar = `${period}|${odeme.currency}`;
    const grup = gruplar.get(anahtar);
    if (grup === undefined) {
      gruplar.set(anahtar, {
        period,
        currency: odeme.currency,
        totalMinor: odeme.amountMinor,
        count: 1,
      });
    } else {
      grup.totalMinor += odeme.amountMinor;
      grup.count += 1;
    }
  }

  // Kronolojik sıra: grafik zaman ekseninde çizilecek.
  return [...gruplar.values()].sort((a, b) =>
    a.period === b.period
      ? a.currency.localeCompare(b.currency)
      : a.period.localeCompare(b.period),
  );
}

function kategoriyeGore(odemeler: Odeme[]) {
  const gruplar = new Map<
    string,
    { categoryId: string; name: string; currency: string; totalMinor: number; count: number }
  >();

  for (const odeme of odemeler) {
    const anahtar = `${odeme.categoryId}|${odeme.currency}`;
    const grup = gruplar.get(anahtar);
    if (grup === undefined) {
      gruplar.set(anahtar, {
        categoryId: odeme.categoryId,
        name: odeme.categoryName,
        currency: odeme.currency,
        totalMinor: odeme.amountMinor,
        count: 1,
      });
    } else {
      grup.totalMinor += odeme.amountMinor;
      grup.count += 1;
    }
  }

  return [...gruplar.values()].sort((a, b) => b.totalMinor - a.totalMinor);
}
