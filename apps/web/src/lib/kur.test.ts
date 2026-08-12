import { describe, expect, it } from 'vitest';
import { tryKarsiligi, type Kurlar } from './kur';

const KURLAR: Kurlar = {
  base: 'TRY',
  date: '2026-08-12',
  rates: { USD: 47.7537, EUR: 55.0978 },
};

describe('TL karşılığı', () => {
  it('dolar tutarını çeviriyor', () => {
    // 24,00 USD → 2400 kuruş × 47,7537 = 114.608,88 kuruş ≈ ₺1.146,09
    expect(tryKarsiligi(2400, 'USD', KURLAR)).toBe(114_609);
  });

  it('TRY için çeviri yapmıyor', () => {
    // Zaten lira; "≈ ₺X" yazmak gürültü olurdu.
    expect(tryKarsiligi(10_000, 'TRY', KURLAR)).toBeNull();
  });

  it('kur bilinmiyorsa null dönüyor', () => {
    // Yanlış bir TL karşılığı, hiç göstermemekten kötü.
    expect(tryKarsiligi(2400, 'GBP', KURLAR)).toBeNull();
    expect(tryKarsiligi(2400, 'USD', undefined)).toBeNull();
  });

  it('yuvarlama tek seferde, en sonda', () => {
    // Ara adımda yuvarlamak birikimli sapma üretir.
    expect(tryKarsiligi(1, 'USD', KURLAR)).toBe(48);
    expect(tryKarsiligi(100, 'USD', KURLAR)).toBe(4775);
  });

  it('sıfır tutarı bozmuyor', () => {
    expect(tryKarsiligi(0, 'USD', KURLAR)).toBe(0);
  });

  it('bozuk kura karşı korumalı', () => {
    const bozuk: Kurlar = {
      base: 'TRY',
      date: null,
      rates: { USD: Number.NaN },
    };
    expect(tryKarsiligi(2400, 'USD', bozuk)).toBeNull();
  });
});
