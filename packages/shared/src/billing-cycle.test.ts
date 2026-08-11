import { describe, expect, it } from 'vitest';
import {
  annualizedMinor,
  monthlyEquivalentMinor,
  totalsFor,
} from './billing-cycle.js';

/**
 * Bu testler projenin en kritik matematiğini koruyor. Buradaki bir hata
 * doğrudan kullanıcıya yanlış para tutarı gösterir — sessizce.
 */
describe('yıllıklaştırma', () => {
  it('aylık aboneliği 12 ile çarpıyor', () => {
    // ₺250/ay → ₺3.000/yıl
    expect(annualizedMinor({ priceMinor: 25000, cycle: 'MONTHLY' })).toBe(
      300000,
    );
  });

  it('yıllık aboneliği olduğu gibi bırakıyor', () => {
    expect(annualizedMinor({ priceMinor: 240000, cycle: 'YEARLY' })).toBe(
      240000,
    );
  });

  it('haftalık aboneliği 52 ile çarpıyor, 48 ile değil', () => {
    // Yaygın hata: haftalığı "ayda 4" sayıp 12 ile çarpmak → 48 hafta.
    // Yılda 52 hafta var; bu fark yıllık maliyette %8 sapma demek.
    expect(annualizedMinor({ priceMinor: 5000, cycle: 'WEEKLY' })).toBe(260000);
  });

  it('üç aylık ve altı aylık döngüleri doğru katsayılarla çarpıyor', () => {
    expect(annualizedMinor({ priceMinor: 10000, cycle: 'QUARTERLY' })).toBe(
      40000,
    );
    expect(annualizedMinor({ priceMinor: 10000, cycle: 'HALF_YEARLY' })).toBe(
      20000,
    );
  });

  it('özel döngüyü gün sayısına göre ölçekliyor', () => {
    // 30 günde bir ₺100 → yılda 365/30 = 12,17 kez
    expect(
      annualizedMinor({
        priceMinor: 10000,
        cycle: 'CUSTOM',
        customIntervalDays: 30,
      }),
    ).toBe(121667);
  });

  it('özel döngüde gün sayısı yoksa hata veriyor', () => {
    expect(() =>
      annualizedMinor({ priceMinor: 10000, cycle: 'CUSTOM' }),
    ).toThrow(/customIntervalDays/);
  });

  it('ondalıklı tutarı reddediyor', () => {
    // Kuruş cinsinden tamsayı bekleniyor; 299.9 bir programlama hatasıdır.
    expect(() =>
      annualizedMinor({ priceMinor: 299.9, cycle: 'MONTHLY' }),
    ).toThrow(/tamsayı/);
  });
});

describe('aylık karşılık', () => {
  it('aylık aboneliğin aylık karşılığı fiyatının kendisi', () => {
    expect(monthlyEquivalentMinor({ priceMinor: 25000, cycle: 'MONTHLY' })).toBe(
      25000,
    );
  });

  it('yıllık ₺2.400 aboneliğin aylık karşılığı ₺200', () => {
    // Ürün tanımındaki örnek.
    expect(
      monthlyEquivalentMinor({ priceMinor: 240000, cycle: 'YEARLY' }),
    ).toBe(20000);
  });

  it('haftalık ₺50 aboneliğin aylık karşılığı ₺216,67', () => {
    // 5000 × 52 / 12 = 21.666,67 kuruş → yarım yukarı → 21667
    expect(monthlyEquivalentMinor({ priceMinor: 5000, cycle: 'WEEKLY' })).toBe(
      21667,
    );
  });
});

describe('toplamlar', () => {
  it('yıllık değerler üzerinden toplayıp bir kez bölüyor', () => {
    const abonelikler = [
      { priceMinor: 29900, cycle: 'MONTHLY' as const }, // Netflix
      { priceMinor: 9900, cycle: 'MONTHLY' as const }, // Spotify
      { priceMinor: 240000, cycle: 'YEARLY' as const }, // yıllık ödenen
    ];

    const { yearlyMinor, monthlyMinor } = totalsFor(abonelikler);

    expect(yearlyMinor).toBe(29900 * 12 + 9900 * 12 + 240000);
    expect(monthlyMinor).toBe(Math.round(yearlyMinor / 12));
  });

  it('tek tek yuvarlayıp toplamaktan daha doğru sonuç veriyor', () => {
    // Yirmi adet haftalık ₺10 abonelik. Tek bir aboneliğin aylık karşılığı
    // 52.000/12 = 4.333,33 kuruş — tam bölünmüyor, yani her birinde 0,33
    // kuruş kayboluyor. Yirmi tanede bu 7 kuruşa çıkıyor.
    //
    // Not: bu testin ilk hâlinde fiyat 333 seçilmişti ve 333×52/12 tam
    // bölündüğü için sapma hiç oluşmuyordu — test geçmesi gereken şeyi
    // ölçmüyordu. Girdi, bölünme artık bırakacak şekilde seçilmeli.
    const haftalik = Array.from({ length: 20 }, () => ({
      priceMinor: 1000,
      cycle: 'WEEKLY' as const,
    }));

    const dogru = totalsFor(haftalik).monthlyMinor;
    const hatali = haftalik.reduce(
      (sum, a) => sum + monthlyEquivalentMinor(a),
      0,
    );

    expect(dogru).toBe(86667); // 1000 × 52 × 20 / 12 = 86.666,67 → 86.667
    expect(hatali).toBe(86660); // (4.333 × 20) — 7 kuruş kayıp
    expect(dogru - hatali).toBe(7);
  });

  it('boş listede sıfır dönüyor', () => {
    expect(totalsFor([])).toEqual({ yearlyMinor: 0, monthlyMinor: 0 });
  });
});
