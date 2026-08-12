import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface Kurlar {
  base: 'TRY';
  /** Kurun ait olduğu gün; henüz hiç çekilmediyse null. */
  date: string | null;
  /** 1 birim yabancı para kaç TRY. */
  rates: Record<string, number>;
}

/**
 * Güncel döviz kurları.
 *
 * Kur günde bir kez değişiyor, o yüzden uzun süre bayat sayılmıyor. Hata
 * durumunda arayüz çeviriyi hiç göstermiyor — yanlış bir TL karşılığı,
 * hiç göstermemekten kötü.
 */
export function useKurlar() {
  return useQuery({
    queryKey: ['rates'],
    queryFn: () => api.get<Kurlar>('/rates'),
    staleTime: 60 * 60 * 1000,
  });
}

/**
 * Yabancı para tutarını TRY'ye çeviriyor; çeviremiyorsa `null`.
 *
 * Tutar kuruş cinsinden geliyor ve kuruş cinsinden dönüyor. Yuvarlama tek
 * seferde, en sonda: ara adımda yuvarlamak birikimli sapma üretir.
 */
export function tryKarsiligi(
  minor: number,
  currency: string,
  kurlar: Kurlar | undefined,
): number | null {
  if (currency === 'TRY' || kurlar === undefined) {
    return null;
  }
  const kur = kurlar.rates[currency];
  if (kur === undefined || !Number.isFinite(kur)) {
    return null;
  }
  return Math.round(minor * kur);
}
