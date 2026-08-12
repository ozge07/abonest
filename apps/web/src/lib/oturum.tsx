import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from './api';
import type { Kullanici } from './types';

/**
 * Oturum durumu.
 *
 * Ayrı bir "giriş yapıldı mı" bayrağı tutmuyoruz: tek doğruluk kaynağı
 * sunucu. `/me` 200 dönüyorsa oturum var, 401 dönüyorsa yok. İki yerde durum
 * tutmak, birinin diğerinden haberi olmadığı anlar üretir — cookie süresi
 * dolduğunda arayüz hâlâ "giriş yapılmış" sanır.
 */
export function useOturum() {
  const sorgu = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<Kullanici>('/me'),
    // 401 beklenen bir cevap, hata değil: tekrar denemenin anlamı yok.
    retry: (deneme, hata) =>
      hata instanceof ApiError && hata.yetkisiz ? false : deneme < 2,
    /*
     * Yeni bir bileşen bu kancayı kullanmaya başladığında **tekrar
     * denenmiyor**.
     *
     * Varsayılan davranış sonsuz döngü üretiyordu: sorgu 401 ile
     * başarısızken ikinci bir bileşen `useOturum()` çağırıyor, TanStack
     * yeniden deniyor, sorgu "beklemede"ye dönüyor, uygulama tam ekran
     * yükleme gösterip o bileşeni söküyor — ve sökülen bileşen tekrar
     * bağlandığında aynı şey baştan başlıyor. Ölçtük: saniyede binlerce
     * istek.
     *
     * Oturum durumu zaten paylaşılan tek bir sorgu; ikinci bir okuyucunun
     * yeni bir istek tetiklemesi için sebep yok.
     */
    retryOnMount: false,
    staleTime: 60_000,
  });

  return {
    kullanici: sorgu.data ?? null,
    yukleniyor: sorgu.isPending,
    girisYapilmis: sorgu.data !== undefined,
  };
}

export function useGiris() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (girdi: { email: string; password: string }) =>
      api.post<{ token: string }>('/auth/login', girdi),
    onSuccess: async () => {
      // Girişten sonra her şey yeniden okunuyor: önceki kullanıcının
      // önbellekteki verisi ekranda kalmasın.
      await queryClient.invalidateQueries();
    },
  });
}

export function useKayit() {
  return useMutation({
    mutationFn: (girdi: { email: string; password: string; name: string }) =>
      api.post<{ userId: string }>('/auth/register', girdi),
  });
}

export function useCikis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<void>('/auth/logout'),
    onSuccess: () => {
      // Sadece geçersiz kılmak yetmez: önbellekteki veri bir sonraki
      // kullanıcıya görünebilirdi.
      queryClient.clear();
    },
  });
}
