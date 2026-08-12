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

  /*
   * 401, önbellekteki veriden daha güncel bir gerçek.
   *
   * Sorgu hata aldığında TanStack Query **eski veriyi tutuyor**: `/me` 401
   * dönse bile `sorgu.data` son bilinen kullanıcıyı taşımaya devam ediyor.
   * Sadece `data`ya bakan bir kural, çıkış yapmış kullanıcıyı hâlâ girişte
   * sanıyordu — çıkışa basınca ekran aynı sayfada kalıyordu, oturum
   * sunucuda silinmiş olmasına rağmen.
   *
   * Aynı durum oturumun süresi dolduğunda da geçerli: sunucu "sen kimsin
   * bilmiyorum" diyorsa, elimizdeki eski kayıt bunu değiştirmiyor.
   */
  const yetkisiz = sorgu.error instanceof ApiError && sorgu.error.yetkisiz;

  return {
    kullanici: yetkisiz ? null : (sorgu.data ?? null),
    yukleniyor: sorgu.isPending,
    girisYapilmis: !yetkisiz && sorgu.data !== undefined,
  };
}

/**
 * "Hesabın geri geldi" haberinin giriş ekranından uygulamaya taşınma yolu.
 *
 * Haber giriş yanıtında geliyor ama gösterileceği yer uygulamanın içi:
 * giriş başarılı olur olmaz giriş ekranı sökülüyor. React durumu o sökülmede
 * kayboluyor, bu yüzden not `sessionStorage`'a bırakılıyor — sekme
 * kapanınca kendiliğinden siliniyor ve kalıcı bir iz bırakmıyor.
 */
const GERI_GETIRILDI = 'hesap-geri-getirildi';

export function geriGetirildiMi(): boolean {
  return sessionStorage.getItem(GERI_GETIRILDI) !== null;
}

export function geriGetirmeNotunuSil(): void {
  sessionStorage.removeItem(GERI_GETIRILDI);
}

export function useGiris() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (girdi: { email: string; password: string }) =>
      api.post<{ token: string; restored: boolean }>('/auth/login', girdi),
    onSuccess: async (yanit) => {
      if (yanit.restored) {
        // Kullanıcı hesabını silmişti ve bu giriş silmeyi geri aldı.
        // Sessizce olup bitmesi doğru olmazdı.
        sessionStorage.setItem(GERI_GETIRILDI, '1');
      }
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
    onSuccess: async () => {
      /*
       * Sıra önemli.
       *
       * Önce yalnızca `clear()` çağrılıyordu ve ekran çıkıştan sonra aynı
       * yerde kalıyordu: sunucudaki oturum gerçekten siliniyor, ama
       * `clear()` **bağlı gözlemcilere haber vermiyor**. Kimse yeniden
       * çizilmediği için `useOturum()` eski kullanıcıyı döndürmeye devam
       * ediyor, uygulama da hâlâ giriş yapılmış sanıyordu.
       *
       * `invalidateQueries` haber veriyor: `/me` yeniden okunuyor, 401
       * geliyor, uygulama giriş ekranına düşüyor. `clear()` ondan sonra
       * kalan veriyi siliyor — bir sonraki kullanıcı öncekinin
       * aboneliklerini görmesin.
       */
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      queryClient.clear();
    },
  });
}
