/**
 * Fatura döngüsü ve maliyet normalizasyonu.
 *
 * Buradaki tek zor karar şu: farklı döngülerdeki abonelikleri karşılaştırmak
 * için ortak bir birime çevirmek gerekiyor. Yol **önce yıllıklaştırmak**, sonra
 * bölmek.
 *
 * Neden ters sırayla değil: haftalık bir aboneliği "aylık" saymak için 4 ile
 * çarpmak yaygın ama yanlış — yılda 52 hafta var, 48 değil. Doğrusu 52/12 =
 * 4,333. Yıllıklaştırıp bölünce bu kendiliğinden doğru çıkıyor.
 *
 * Bu dosya saf: veritabanı, tarih "şimdi"si, IO yok. Projenin en kritik
 * matematiği burada olduğu için hiçbir kurulum gerektirmeden test edilebilir.
 */

import { assertValidMinor, type MinorUnits } from './money.js';

export const BILLING_CYCLES = [
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'HALF_YEARLY',
  'YEARLY',
  'CUSTOM',
] as const;

export type BillingCycle = (typeof BILLING_CYCLES)[number];

/** Bir yılda kaç kez tahsilat yapıldığı. CUSTOM ayrı ele alınıyor. */
const OCCURRENCES_PER_YEAR: Record<Exclude<BillingCycle, 'CUSTOM'>, number> = {
  WEEKLY: 52,
  MONTHLY: 12,
  QUARTERLY: 4,
  HALF_YEARLY: 2,
  YEARLY: 1,
};

/**
 * Özel döngülerde bir yılın kaç gün sayılacağı.
 *
 * 365,25 daha doğru olurdu ama sonucu kesir yapıyor; abonelik maliyeti
 * tahmininde artık yıl farkı (%0,07) anlamsız. Sabit 365 seçmek sonucun
 * yıldan yıla değişmemesini de sağlıyor.
 */
const DAYS_PER_YEAR = 365;

export interface CycleInput {
  readonly priceMinor: MinorUnits;
  readonly cycle: BillingCycle;
  /** Yalnızca CUSTOM için: kaç günde bir tahsil ediliyor. */
  readonly customIntervalDays?: number;
}

/**
 * Yıllık toplam maliyet.
 *
 * Toplamlar **her zaman** bu değer üzerinden yapılır. Her aboneliği ayrı ayrı
 * aylığa çevirip toplamak, otuz abonelikte gözle görülür sapma üretir: her
 * bölmede en fazla yarım kuruş kaybediyoruz ve bu kayıplar birikiyor.
 */
export function annualizedMinor(input: CycleInput): MinorUnits {
  assertValidMinor(input.priceMinor);

  if (input.cycle === 'CUSTOM') {
    const days = input.customIntervalDays;
    if (days === undefined || !Number.isInteger(days) || days <= 0) {
      throw new RangeError(
        'CUSTOM döngüde customIntervalDays pozitif tamsayı olmalı.',
      );
    }
    return roundHalfUp((input.priceMinor * DAYS_PER_YEAR) / days);
  }

  return input.priceMinor * OCCURRENCES_PER_YEAR[input.cycle];
}

/**
 * Aylık karşılık.
 *
 * Yuvarlama **yalnızca burada**, yani sunuma en yakın noktada yapılıyor.
 */
export function monthlyEquivalentMinor(input: CycleInput): MinorUnits {
  return roundHalfUp(annualizedMinor(input) / 12);
}

/**
 * Birden çok aboneliğin toplam yıllık ve aylık maliyeti.
 *
 * Yıllık değerler tamsayı olarak toplanıyor (kayıpsız), bölme tek sefer
 * yapılıyor.
 */
export function totalsFor(inputs: readonly CycleInput[]): {
  yearlyMinor: MinorUnits;
  monthlyMinor: MinorUnits;
} {
  const yearlyMinor = inputs.reduce(
    (sum, input) => sum + annualizedMinor(input),
    0,
  );
  return { yearlyMinor, monthlyMinor: roundHalfUp(yearlyMinor / 12) };
}

/**
 * Yarımı yukarı yuvarlama.
 *
 * `Math.round` negatif sayılarda yarımı sıfıra doğru değil yukarı yuvarlıyor
 * (`Math.round(-0.5) === -0`), bu da işaretine göre tutarsız davranış demek.
 * Para hesabında büyüklüğe göre tutarlı olmak gerekiyor.
 */
function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}
