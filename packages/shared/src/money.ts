/**
 * Para gösterimi.
 *
 * Tutarlar **minor unit** (kuruş / cent) olarak, tamsayı tutulur. Ondalık sayı
 * hiçbir yerde kullanılmaz — `0.1 + 0.2 !== 0.3` olduğu için para hesabında
 * kayan nokta kabul edilemez.
 *
 * Veritabanında `BIGINT`, uygulamada `number`. Dönüşüm depo katmanında yapılır
 * ve aralık denetlenir: JavaScript tamsayıları 2^53'e kadar kayıpsız, bu da
 * 90 trilyon kuruş demek — abonelik tutarları için fazlasıyla yeterli.
 */

/** ISO 4217 kodu. MVP'de dördü destekleniyor. */
export const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP'] as const;
export type Currency = (typeof CURRENCIES)[number];

/**
 * Para biriminin ondalık basamak sayısı.
 *
 * Sabit 2 varsaymıyoruz: JPY 0, KWD 3 basamaklı. Bugün desteklediğimiz dördü
 * de 2 olsa bile varsayımı koda gömmek, beşinci para birimi eklendiğinde
 * sessiz bir hataya dönüşürdü.
 */
/**
 * Tutarlar tamsayı **kuruş** olarak taşınıyor.
 *
 * Kayan nokta para için uygun değil: `0.1 + 0.2 !== 0.3`. Tamsayı kuruşta
 * böyle bir sapma olmuyor.
 */
export type MinorUnits = number;

const EXPONENTS: Record<Currency, number> = {
  TRY: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
};

function exponentOf(currency: Currency): number {
  return EXPONENTS[currency];
}

export function assertValidMinor(value: number): asserts value is MinorUnits {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Tutar tamsayı olmalı, alınan: ${value}`);
  }
}

/**
 * Kullanıcının girdiği ondalıklı metni minor unit'e çevirir.
 *
 * `"299,90"` ve `"299.90"` → `29990`. Türkçe klavyede virgül yazılıyor;
 * ikisini de kabul etmemek gerçek bir kullanılabilirlik sorunu.
 */
export function parseAmount(input: string, currency: Currency): MinorUnits {
  const normalized = input.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    throw new RangeError(`Geçersiz tutar: ${input}`);
  }

  const exponent = exponentOf(currency);
  const [whole = '0', fraction = ''] = normalized.split('.');
  const negative = whole.startsWith('-');

  // Ondalık kısım basamak sayısına tamamlanıyor; fazlası kesiliyor (yuvarlama
  // değil). Kullanıcı "1,005" yazdıysa 1,00 kabul ediyoruz — para girişinde
  // yukarı yuvarlamak beklenmedik bir ücret üretir.
  const padded = fraction.padEnd(exponent, '0').slice(0, exponent);
  const digits = `${whole.replace('-', '')}${padded}`;
  const amount = Number(digits);

  assertValidMinor(amount);
  return negative ? -amount : amount;
}

