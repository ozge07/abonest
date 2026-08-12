import type { DefaultOptions } from '@tanstack/react-query';
import { ApiError } from './api';

/**
 * Sorgu istemcisinin varsayılanları.
 *
 * Ayrı bir dosyada, çünkü testler de aynı ayarları kullanmak zorunda:
 * `main.tsx` içinde kalsaydı test kendi istemcisini kurar ve üretimden farklı
 * davranan bir uygulamayı sınardı — bu projede daha önce tam olarak bu
 * olmuştu (bkz. ADR-0011).
 */
export const sorguSecenekleri: DefaultOptions = {
  queries: {
    /**
     * İstemci hataları tekrar denenmiyor.
     *
     * TanStack Query varsayılan olarak başarısız isteği üç kez daha deniyor
     * ve aralar katlanarak büyüyor (1s + 2s + 4s). 4xx bir **istemci**
     * hatası: aynı isteği tekrar göndermek aynı cevabı getirir, yalnızca
     * kullanıcıyı bekletir.
     *
     * Bu, somut bir şikâyetten çıktı: doğrulanmamış kullanıcıda bütün veri
     * uçları 403 dönüyor ve ekranlar yedi saniye "Yükleniyor" kalıyordu.
     *
     * 5xx ve ağ hataları geçici olabiliyor; onlarda tekrar deniyoruz.
     */
    retry: (deneme, hata) => {
      if (hata instanceof ApiError && hata.problem.status < 500) {
        return false;
      }
      return deneme < 2;
    },
    // Sekmeye her dönüşte yeniden istek atmak, abonelik verisi gibi yavaş
    // değişen bir şeyde gereksiz trafik.
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  },
  mutations: {
    // Yazma isteklerinde tekrar denemek tehlikeli: sunucu isteği almış ama
    // yanıt kaybolmuşsa ikinci deneme aynı işi iki kez yapar.
    retry: false,
  },
};
