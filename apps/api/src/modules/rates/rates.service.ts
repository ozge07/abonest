import { Inject, Injectable } from '@nestjs/common';
import type { Logger } from 'pino';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { LOGGER } from '../../infra/logger/logger.token.js';

/**
 * Döviz kuru — kaynak **TCMB'nin günlük bülteni**.
 *
 * ## Neden gerçek bir kaynak
 *
 * Bu uygulama para gösteriyor ve ADR-0007'de "uydurma bir kurla toplanmış
 * tek bir sayı, kullanıcının güvenebileceği bir sayı değil" yazıyor. O karar
 * hâlâ geçerli: **toplamlar** para birimi başına ayrı kalıyor. Buradaki
 * çeviri farklı bir iş — kullanıcının "24 dolar kaç lira ediyor" sorusuna
 * cevap; yanında hangi günün kuruyla hesaplandığı da yazıyor.
 *
 * TCMB seçildi çünkü TRY için resmî kaynak, ücretsiz ve anahtar istemiyor.
 *
 * ## Neden saklanıyor
 *
 * Her istekte TCMB'ye gitmek ekranı dış bir servise bağımlı kılardı. Kur
 * günde bir çekiliyor; servis düştüğünde son bilinen kur gösteriliyor ve
 * tarihi de görünüyor, yani kullanıcı bayat bir kura yanlışlıkla güvenmiyor.
 *
 * ## Hafta sonu
 *
 * TCMB cumartesi ve pazar bülten yayımlamıyor. `today.xml` o günlerde son iş
 * gününün verisini döndürüyor ya da hata veriyor; ikisi de sorun değil,
 * elimizdeki son kur zaten saklı.
 */
@Injectable()
export class RatesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /**
   * Arayüzün kullandığı biçim: 1 birim yabancı para kaç TRY.
   *
   * **Bayatsa anında tazeleniyor.** Yalnızca gecelik işe bırakmak, gün
   * içinde uygulamayı ilk açan kullanıcının dünkü kuru görmesi demekti.
   * TCMB günde bir kez (~15:30) yayımladığı için "anlık kur" diye bir şey
   * yok; elde edilebilecek en güncel değer bugünün bülteni ve burada o
   * garanti ediliyor.
   */
  async latest(): Promise<{
    base: 'TRY';
    date: string | null;
    rates: Record<string, number>;
  }> {
    if (await this.bayatMi()) {
      await this.refresh();
    }

    const satirlar = await this.prisma.exchangeRate.findMany();

    const rates: Record<string, number> = {};
    let enYeni: Date | null = null;

    for (const satir of satirlar) {
      rates[satir.code] = Number(satir.tryPerUnit);
      if (enYeni === null || satir.rateDate > enYeni) {
        enYeni = satir.rateDate;
      }
    }

    return {
      base: 'TRY',
      date: enYeni === null ? null : enYeni.toISOString().slice(0, 10),
      rates,
    };
  }

  /**
   * Saklanan kur bugünden eski mi?
   *
   * Hafta sonu ve tatillerde TCMB yayın yapmıyor; o günlerde tazeleme
   * denemesi sonuç getirmiyor ve elde son iş gününün kuru kalıyor — doğru
   * davranış bu. Deneme ucuz: başarısız olursa saklanan veri değişmiyor.
   */
  private async bayatMi(): Promise<boolean> {
    const enYeni = await this.prisma.exchangeRate.findFirst({
      orderBy: { rateDate: 'desc' },
      select: { rateDate: true, fetchedAt: true },
    });

    if (enYeni === null) {
      return true;
    }

    const bugun = new Date();
    const bugunGun = Date.UTC(
      bugun.getUTCFullYear(),
      bugun.getUTCMonth(),
      bugun.getUTCDate(),
    );

    // Kur bugüne aitse taze. Değilse, bugün zaten denediysek tekrar
    // denemiyoruz — hafta sonu her istekte TCMB'ye gitmenin anlamı yok.
    if (enYeni.rateDate.getTime() >= bugunGun) {
      return false;
    }
    return enYeni.fetchedAt.getTime() < bugunGun;
  }

  /**
   * TCMB'den güncel kurları çekip saklıyor; kaç para birimi güncellendiğini
   * döndürüyor.
   *
   * **Hata fırlatmıyor.** Kur çekilemedi diye günlük iş düşmemeli;
   * hatırlatmalar kurdan bağımsız ve elimizde zaten dünkü kur var.
   */
  async refresh(): Promise<number> {
    try {
      const yanit = await fetch('https://www.tcmb.gov.tr/kurlar/today.xml', {
        signal: AbortSignal.timeout(15_000),
      });
      if (!yanit.ok) {
        this.logger.warn({ status: yanit.status }, 'TCMB kur bülteni alınamadı');
        return 0;
      }

      const { tarih, kurlar } = ayrıştır(await yanit.text());
      if (kurlar.size === 0) {
        this.logger.warn('TCMB bülteninde kur bulunamadı');
        return 0;
      }

      for (const [kod, deger] of kurlar) {
        await this.prisma.exchangeRate.upsert({
          where: { code: kod },
          create: { code: kod, tryPerUnit: deger, rateDate: tarih },
          update: { tryPerUnit: deger, rateDate: tarih, fetchedAt: new Date() },
        });
      }

      this.logger.info(
        { adet: kurlar.size, tarih: tarih.toISOString().slice(0, 10) },
        'Döviz kurları güncellendi',
      );
      return kurlar.size;
    } catch (hata) {
      this.logger.warn({ hata }, 'Döviz kuru güncellenemedi');
      return 0;
    }
  }
}

/** Uygulamanın desteklediği para birimleri; gerisini saklamanın anlamı yok. */
const ILGILENILEN = new Set(['USD', 'EUR', 'GBP']);

/**
 * TCMB XML'ini ayrıştırıyor.
 *
 * XML kütüphanesi eklemiyoruz: belgenin şekli sabit ve iki alan okuyoruz.
 * Bir bağımlılık, bu iş için taşıdığı riskten daha az değer üretirdi.
 *
 * `ForexSelling` (döviz satış) kullanılıyor — kullanıcı o parayı almak için
 * ödeyeceği kur bu. Boşsa `ForexBuying`'e düşülüyor; bazı para birimlerinde
 * satış alanı boş geliyor.
 */
function ayrıştır(xml: string): { tarih: Date; kurlar: Map<string, number> } {
  const kurlar = new Map<string, number>();

  const tarihEslesme = /Tarih="(\d{2})\.(\d{2})\.(\d{4})"/.exec(xml);
  const tarih =
    tarihEslesme === null
      ? bugun()
      : new Date(
          Date.UTC(
            Number(tarihEslesme[3]),
            Number(tarihEslesme[2]) - 1,
            Number(tarihEslesme[1]),
          ),
        );

  for (const blok of xml.split('<Currency ').slice(1)) {
    const kod = /Kod="([A-Z]{3})"/.exec(blok)?.[1];
    if (kod === undefined || !ILGILENILEN.has(kod)) {
      continue;
    }

    const birim = Number(/<Unit>(\d+)<\/Unit>/.exec(blok)?.[1] ?? '1');
    const satis = sayi(/<ForexSelling>([\d.]*)<\/ForexSelling>/.exec(blok)?.[1]);
    const alis = sayi(/<ForexBuying>([\d.]*)<\/ForexBuying>/.exec(blok)?.[1]);
    const kur = satis ?? alis;

    // Bazı para birimleri 100 birim üzerinden kote ediliyor (JPY gibi).
    if (kur !== null && birim > 0) {
      kurlar.set(kod, kur / birim);
    }
  }

  return { tarih, kurlar };
}

function sayi(ham: string | undefined): number | null {
  if (ham === undefined || ham.trim() === '') {
    return null;
  }
  const deger = Number(ham);
  return Number.isFinite(deger) && deger > 0 ? deger : null;
}

function bugun(): Date {
  const simdi = new Date();
  return new Date(
    Date.UTC(simdi.getUTCFullYear(), simdi.getUTCMonth(), simdi.getUTCDate()),
  );
}
