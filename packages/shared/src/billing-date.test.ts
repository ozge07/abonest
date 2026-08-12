import { describe, expect, it } from 'vitest';
import {
  addMonths,
  calendarDate,
  nextOccurrence,
  occurrenceDate,
  occurrencesBetween,
  previousOccurrence,
  toISODate,
} from './billing-date.js';

const d = calendarDate;
const iso = toISODate;

describe('addMonths — ay sonu kırpması', () => {
  it('31 Ocak + 1 ay = 28 Şubat (normal yıl)', () => {
    // JavaScript'in yerleşik setUTCMonth davranışı burada 3 Mart üretiyor.
    expect(iso(addMonths(d(2026, 1, 31), 1))).toBe('2026-02-28');
  });

  it('31 Ocak + 1 ay = 29 Şubat (artık yıl)', () => {
    expect(iso(addMonths(d(2028, 1, 31), 1))).toBe('2028-02-29');
  });

  it('31 Mayıs + 1 ay = 30 Haziran', () => {
    expect(iso(addMonths(d(2026, 5, 31), 1))).toBe('2026-06-30');
  });

  it('yıl sınırını doğru geçiyor', () => {
    expect(iso(addMonths(d(2026, 11, 15), 3))).toBe('2027-02-15');
    expect(iso(addMonths(d(2026, 2, 15), -3))).toBe('2025-11-15');
  });

  it('29 Şubat + 12 ay = 28 Şubat', () => {
    expect(iso(addMonths(d(2028, 2, 29), 12))).toBe('2029-02-28');
  });
});

describe('occurrenceDate — çapadan hesaplama', () => {
  it('ay sonu kırpması kalıcı hâle gelmiyor', () => {
    // ADR-0009'un tam kanıtı. Zincirleme hesapta 3. ödeme 28 Mart çıkardı;
    // çapadan hesapta 31 Mart çıkıyor.
    const baslangic = d(2026, 1, 31);
    const spec = { cycle: 'MONTHLY' as const };

    expect(iso(occurrenceDate(baslangic, spec, 0))).toBe('2026-01-31');
    expect(iso(occurrenceDate(baslangic, spec, 1))).toBe('2026-02-28'); // kırpıldı
    expect(iso(occurrenceDate(baslangic, spec, 2))).toBe('2026-03-31'); // geri döndü
    expect(iso(occurrenceDate(baslangic, spec, 3))).toBe('2026-04-30');
    expect(iso(occurrenceDate(baslangic, spec, 4))).toBe('2026-05-31');
  });

  it('haftalık döngü 7 gün ekliyor', () => {
    const spec = { cycle: 'WEEKLY' as const };
    expect(iso(occurrenceDate(d(2026, 8, 12), spec, 1))).toBe('2026-08-19');
    expect(iso(occurrenceDate(d(2026, 8, 12), spec, 4))).toBe('2026-09-09');
  });

  it('üç aylık, altı aylık ve yıllık döngüler', () => {
    const baslangic = d(2026, 3, 15);
    expect(iso(occurrenceDate(baslangic, { cycle: 'QUARTERLY' }, 2))).toBe(
      '2026-09-15',
    );
    expect(iso(occurrenceDate(baslangic, { cycle: 'HALF_YEARLY' }, 1))).toBe(
      '2026-09-15',
    );
    expect(iso(occurrenceDate(baslangic, { cycle: 'YEARLY' }, 2))).toBe(
      '2028-03-15',
    );
  });

  it('özel döngü gün aralığını kullanıyor', () => {
    // 1 Ocak + 90 gün: Ocak'tan 30, Şubat 28, Mart 31 = 89 → 1 Nisan.
    const spec = { cycle: 'CUSTOM' as const, customIntervalDays: 45 };
    expect(iso(occurrenceDate(d(2026, 1, 1), spec, 2))).toBe('2026-04-01');
  });

  it('özel döngüde gün aralığı yoksa hata veriyor', () => {
    expect(() =>
      occurrenceDate(d(2026, 1, 1), { cycle: 'CUSTOM' }, 1),
    ).toThrow(/customIntervalDays/);
  });
});

describe('nextOccurrence', () => {
  const spec = { cycle: 'MONTHLY' as const };

  it('başlangıç gelecekteyse başlangıcı döndürüyor', () => {
    expect(iso(nextOccurrence(d(2026, 9, 1), spec, d(2026, 8, 11))!)).toBe(
      '2026-09-01',
    );
  });

  it('bugün ödeme günüyse bugünü döndürüyor', () => {
    // Ödeme bugün; henüz geçmedi, dolayısıyla "sonraki" bugündür.
    expect(iso(nextOccurrence(d(2026, 1, 12), spec, d(2026, 8, 12))!)).toBe(
      '2026-08-12',
    );
  });

  it('geçmiş başlangıçtan doğru sonraki tarihi buluyor', () => {
    expect(iso(nextOccurrence(d(2024, 3, 5), spec, d(2026, 8, 11))!)).toBe(
      '2026-09-05',
    );
  });

  it('ay sonu aboneliğinde doğru çalışıyor', () => {
    // 31'inde başlayan abonelik, Şubat'ta 28'e kırpılıyor.
    expect(iso(nextOccurrence(d(2026, 1, 31), spec, d(2026, 2, 1))!)).toBe(
      '2026-02-28',
    );
    expect(iso(nextOccurrence(d(2026, 1, 31), spec, d(2026, 3, 1))!)).toBe(
      '2026-03-31',
    );
  });

  it('bitiş tarihi geçilmişse null dönüyor', () => {
    expect(
      nextOccurrence(d(2024, 1, 1), spec, d(2026, 8, 11), d(2026, 6, 30)),
    ).toBeNull();
  });

  it('yıllık abonelikte uzun aradan sonra doğru tarihi buluyor', () => {
    expect(
      iso(nextOccurrence(d(2015, 6, 20), { cycle: 'YEARLY' }, d(2026, 8, 11))!),
    ).toBe('2027-06-20');
  });
});

describe('occurrencesBetween', () => {
  it('aralıktaki bütün ödemeleri sırayla veriyor', () => {
    const tarihler = occurrencesBetween(
      d(2026, 1, 15),
      { cycle: 'MONTHLY' },
      d(2026, 8, 1),
      d(2026, 11, 30),
    );
    expect(tarihler.map(iso)).toEqual([
      '2026-08-15',
      '2026-09-15',
      '2026-10-15',
      '2026-11-15',
    ]);
  });

  it('bitiş tarihinde duruyor', () => {
    const tarihler = occurrencesBetween(
      d(2026, 1, 10),
      { cycle: 'MONTHLY' },
      d(2026, 8, 1),
      d(2026, 12, 31),
      d(2026, 10, 15),
    );
    expect(tarihler.map(iso)).toEqual(['2026-08-10', '2026-09-10', '2026-10-10']);
  });

  it('aralıkta ödeme yoksa boş dönüyor', () => {
    const tarihler = occurrencesBetween(
      d(2026, 1, 1),
      { cycle: 'YEARLY' },
      d(2026, 3, 1),
      d(2026, 6, 1),
    );
    expect(tarihler).toEqual([]);
  });

  it('haftalık döngüde 60 günlük ufku dolduruyor', () => {
    const tarihler = occurrencesBetween(
      d(2026, 8, 3),
      { cycle: 'WEEKLY' },
      d(2026, 8, 11),
      d(2026, 10, 10),
    );
    // 17/24/31 Ağustos · 7/14/21/28 Eylül · 5 Ekim = 8 tarih.
    // 12 Ekim ufkun dışında kalıyor.
    expect(tarihler).toHaveLength(8);
    expect(iso(tarihler[0]!)).toBe('2026-08-17');
    expect(iso(tarihler.at(-1)!)).toBe('2026-10-05');
  });
});

describe('previousOccurrence — geçmiş ödeme', () => {
  const spec = { cycle: 'MONTHLY' as const };

  it('dün geçen ödemeyi buluyor', () => {
    // Kullanıcının bildirdiği durum: 11 Temmuz'da başlayan abonelik,
    // bugün 12 Ağustos. 11 Ağustos ödemesi dün geçti.
    expect(iso(previousOccurrence(d(2026, 7, 11), spec, d(2026, 8, 12))!)).toBe(
      '2026-08-11',
    );
  });

  it('başlangıç gelecekteyse null dönüyor', () => {
    expect(previousOccurrence(d(2026, 9, 1), spec, d(2026, 8, 12))).toBeNull();
  });

  it('bugün ödeme günüyse null dönüyor', () => {
    // Bugünkü ödeme geçmiş değil; nextOccurrence onu zaten veriyor.
    expect(previousOccurrence(d(2026, 8, 12), spec, d(2026, 8, 12))).toBeNull();
  });

  it('ilk ödeme henüz geçmediyse null dönüyor', () => {
    expect(previousOccurrence(d(2026, 8, 20), spec, d(2026, 8, 12))).toBeNull();
  });

  it('uzun geçmişte doğru tarihi buluyor', () => {
    expect(
      iso(previousOccurrence(d(2015, 6, 20), { cycle: 'YEARLY' }, d(2026, 8, 12))!),
    ).toBe('2026-06-20');
  });

  it('ay sonu kırpmasında doğru çalışıyor', () => {
    // 31 Ocak'ta başlayan abonelikte 28 Şubat ödemesi.
    expect(iso(previousOccurrence(d(2026, 1, 31), spec, d(2026, 3, 1))!)).toBe(
      '2026-02-28',
    );
  });
});
