import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { ApiError, api } from '../lib/api';
import { useOturum } from '../lib/oturum';
import { KimlikDuzeni } from './GirisSayfasi';

/**
 * E-postadaki doğrulama bağlantısının indiği yer.
 *
 * ## Neden herkese açık
 *
 * Kullanıcı postayı telefonunda açıyor olabilir, oysa hesabına
 * bilgisayarından girmiştir. Bağlantının çalışması için oturum şart olsaydı,
 * tıklayan kişi önce giriş ekranına düşer ve doğrulama yarıda kalırdı.
 * Token'ın kendisi zaten kimlik yerine geçiyor: tahmin edilemez, tek
 * kullanımlık ve süreli.
 */
/**
 * Bu sayfa açılışında gönderilmiş token'lar.
 *
 * Bileşen içindeki bir `ref` yetmiyor: doğrulama sonrası ağaç yeniden
 * kuruluyor ve bileşen tekrar bağlandığında ref sıfırlanıyor. Token tek
 * kullanımlık olduğu için ikinci istek "süresi dolmuş" hatası alır —
 * kullanıcı başarılı bir işlemi hata olarak görürdü.
 */
const gonderilenler = new Set<string>();

export function BaglantiylaDogrulama() {
  const [parametreler] = useSearchParams();
  const token = parametreler.get('token');
  const queryClient = useQueryClient();
  const { girisYapilmis } = useOturum();

  const dogrula = useMutation({
    mutationFn: (deger: string) =>
      api.post<void>('/auth/verify-email', { token: deger }),
    onSuccess: async () => {
      /*
       * Oturum bilgisi yalnızca **giriş yapılmışsa** tazeleniyor.
       *
       * Koşulsuz tazelemek sonsuz döngü üretiyordu: oturumsuz kullanıcıda
       * `/me` yine 401 dönüyor, uygulama yükleme ekranına düşüp bileşeni
       * yeniden kuruyor, o da token'ı tekrar gönderiyordu. Girişi olmayan
       * birinde tazelenecek bir oturum zaten yok.
       */
      if (girisYapilmis) {
        await queryClient.invalidateQueries({ queryKey: ['me'] });
      }
    },
  });

  /*
   * Bağlantı tıklanır tıklanmaz doğrulanıyor; kullanıcıya ikinci bir düğme
   * göstermenin anlamı yok — tıklamakla niyetini zaten belirtti.
   *
   * Bağımlılıkta yalnızca `token` ve `mutate` var. Mutasyon nesnesinin
   * kendisi her render'da değişiyor; onu bağımlılığa koymak etkiyi sürekli
   * yeniden çalıştırırdı.
   */
  const { mutate } = dogrula;
  useEffect(() => {
    if (token === null || token === '' || gonderilenler.has(token)) {
      return;
    }
    gonderilenler.add(token);
    mutate(token);
  }, [token, mutate]);

  if (token === null || token === '') {
    return (
      <KimlikDuzeni
        baslik="Bağlantı eksik"
        altBaslik="Doğrulama kodu adreste görünmüyor."
      >
        <p className="text-sm text-slate-600 dark:text-slate-400">
          E-postadaki bağlantıyı tam olarak kopyaladığından emin ol. Kodu
          uygulamadaki doğrulama ekranına elle de yapıştırabilirsin.
        </p>
        <Girise />
      </KimlikDuzeni>
    );
  }

  if (dogrula.isPending) {
    return (
      <KimlikDuzeni baslik="Doğrulanıyor…" altBaslik="Bir saniye.">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          E-posta adresin doğrulanıyor.
        </p>
      </KimlikDuzeni>
    );
  }

  if (dogrula.isError) {
    const mesaj =
      dogrula.error instanceof ApiError
        ? dogrula.error.problem.title
        : 'Doğrulama tamamlanamadı.';

    return (
      <KimlikDuzeni baslik="Doğrulanamadı" altBaslik={mesaj}>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Bağlantının süresi dolmuş ya da daha önce kullanılmış olabilir.
          Giriş yapıp yeni bir kod isteyebilirsin.
        </p>
        <Girise />
      </KimlikDuzeni>
    );
  }

  if (dogrula.isSuccess) {
    return (
      <KimlikDuzeni
        baslik="Hesabın hazır"
        altBaslik="E-posta adresin doğrulandı."
      >
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {girisYapilmis
            ? 'Bu sekmede zaten giriş yapmıştın; uygulamaya devam edebilirsin.'
            : 'Şimdi giriş yapıp aboneliklerini eklemeye başlayabilirsin.'}
        </p>
        <Girise etiket={girisYapilmis ? 'Uygulamaya git' : 'Giriş yap'} />
      </KimlikDuzeni>
    );
  }

  return null;
}

function Girise({ etiket = 'Giriş yap' }: { etiket?: string }) {
  return (
    <Link
      to="/"
      className="self-start rounded-md bg-marka-600 px-4 py-2 text-sm font-medium text-marka-yazi hover:bg-marka-500"
    >
      {etiket}
    </Link>
  );
}
