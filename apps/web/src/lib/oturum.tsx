import { useCallback } from 'react';
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
  const hata = sorgu.error instanceof ApiError ? sorgu.error : null;
  const yetkisiz = hata !== null && hata.yetkisiz;

  /*
   * Oturum boşta kaldığı için kapandıysa sebebini giriş ekranına bırakıyoruz.
   *
   * Ayrım sunucunun `type` alanından: "elimizde eski kullanıcı verisi var
   * mı" diye bakmak yetmiyordu, çünkü asıl durum sekmeye dönüp **sayfayı
   * yenilemek** ve orada ilk istek zaten 401 oluyor, elde veri olmuyor.
   * Ölçtük: not hiç çıkmıyordu.
   *
   * Tipe bakmak aynı zamanda "hiç giriş yapmamış ziyaretçi" ile bu durumu
   * ayırıyor; onda tip sıradan `unauthorized` ve not yazılmıyor.
   */
  // `type?.` — ağdan gelen gövdede alan olmayabilir. Zorunlu saymak
  // uygulamanın tamamını çökertiyordu; testlerde ölçüldü.
  if (hata?.problem.type?.endsWith('/session-idle') === true) {
    sessionStorage.setItem(OTURUM_NOTU, hata.problem.title);
  }

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

/**
 * "Oturumun neden kapandı" notu.
 *
 * Kullanıcı bir anda giriş ekranında buluyor kendini; sebebini bilmeden
 * bu, uygulamanın kendiliğinden bozulması gibi görünüyor. Sunucu 401'in
 * gövdesinde sebebi zaten söylüyor, biz onu giriş ekranına taşıyoruz.
 *
 * Yalnızca **istem dışı** çıkışlarda yazılıyor: kullanıcı kendi çıktığında
 * "oturumun kapandı" demek gereksiz gürültü olurdu.
 */
const OTURUM_NOTU = 'oturum-notu';

export function oturumNotu(): string | null {
  return sessionStorage.getItem(OTURUM_NOTU);
}

export function oturumNotunuSil(): void {
  sessionStorage.removeItem(OTURUM_NOTU);
}

export function geriGetirildiMi(): boolean {
  return sessionStorage.getItem(GERI_GETIRILDI) !== null;
}

export function geriGetirmeNotunuSil(): void {
  sessionStorage.removeItem(GERI_GETIRILDI);
}

/**
 * Girişten sonra uygulamayı açan tazeleme.
 *
 * Ayrı bir kanca, çünkü ne zaman çağrılacağı ekrana bağlı: giriş ekranı
 * bunu kırılma animasyonu bittikten sonra çağırıyor.
 */
export function useOturumuTazele() {
  const queryClient = useQueryClient();

  /*
   * `useCallback` şart: bu fonksiyon giriş ekranındaki zamanlayıcı
   * efektinin bağımlılığı. Her çizimde yeni bir referans dönseydi efekt
   * her seferinde sökülüp yeniden kurulur, zamanlayıcılar sıfırlanır ve
   * kırılma sırası hiçbir zaman tamamlanmazdı. Testte tam olarak bu oldu.
   */
  return useCallback(async () => {
    // Önceki kullanıcının önbellekteki verisi ekranda kalmasın.
    await queryClient.invalidateQueries();
  }, [queryClient]);
}

export function useGiris() {
  return useMutation({
    mutationFn: (girdi: { email: string; password: string }) =>
      api.post<{ token: string; restored: boolean }>('/auth/login', girdi),
    onSuccess: async (yanit) => {
      if (yanit.restored) {
        // Kullanıcı hesabını silmişti ve bu giriş silmeyi geri aldı.
        // Sessizce olup bitmesi doğru olmazdı.
        sessionStorage.setItem(GERI_GETIRILDI, '1');
      }
      /*
       * Tazeleme burada **yapılmıyor**.
       *
       * Yenilendiği anda uygulama giriş ekranını söküp panoyu çiziyor;
       * kırılma animasyonu da o anda kesiliyordu. Zamanlamayı çağıran
       * ekran biliyor, o yüzden kararı ona bırakıyoruz.
       */
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
      // Kendi çıkan kullanıcıya "oturumun kapandı" demek gürültü; yukarıdaki
      // geçersizleştirme notu yazmış olabilir, siliyoruz.
      oturumNotunuSil();
    },
  });
}
