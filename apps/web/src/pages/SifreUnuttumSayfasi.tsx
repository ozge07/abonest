import { type FormEvent } from 'react';
import { Link } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { epostaAlani } from '@abonelik/shared';
import { Alan, Dugme, HataKutusu } from '../components/form';
import { ApiError, api } from '../lib/api';
import { useAlan } from '../lib/alan';
import { KimlikDuzeni } from './GirisSayfasi';

/**
 * Şifre sıfırlama isteği.
 *
 * Bu ekran yoktu: sunucu ucu ve e-posta hazırdı ama giriş ekranında bir
 * bağlantı bulunmuyordu, yani şifresini unutan kullanıcının hesabına
 * dönmesinin **hiçbir yolu yoktu**.
 *
 * ## Neden her durumda aynı şeyi söylüyor
 *
 * Sunucu, adres kayıtlı olsa da olmasa da 202 dönüyor; ekran da aynı
 * cümleyi gösteriyor. "Bu e-posta kayıtlı değil" demek, hangi adreslerin
 * sistemde olduğunu tarayarak öğrenmeyi mümkün kılardı. Kullanıcı
 * açısından kayıp yok: adresi yanlış yazdıysa posta gelmiyor ve tekrar
 * deniyor.
 */
export function SifreUnuttumSayfasi() {
  const istek = useMutation({
    mutationFn: (email: string) =>
      api.post<void>('/auth/forgot-password', { email }),
  });

  const hata = istek.error;
  const sunucuHatalari = hata instanceof ApiError ? hata.alanHatalari : {};
  const eposta = useAlan(epostaAlani, sunucuHatalari['email']);

  function gonder(olay: FormEvent) {
    olay.preventDefault();
    eposta.gonderildi();
    if (!eposta.gecerli) {
      return;
    }
    istek.mutate(eposta.deger);
  }

  if (istek.isSuccess) {
    return (
      <KimlikDuzeni
        baslik="Postanı kontrol et"
        altBaslik="Sıfırlama bağlantısını gönderdik."
      >
        <p className="text-sm text-slate-600 dark:text-slate-400">
          <strong className="font-medium text-slate-900 dark:text-slate-100">
            {eposta.deger}
          </strong>{' '}
          adresi kayıtlıysa, şifreni yenilemen için bir bağlantı gönderdik.
          Bağlantı 30 dakika geçerli. Gelmediyse spam klasörüne de bak.
        </p>

        <Link
          to="/giris"
          className="text-sm font-medium text-marka-600 hover:underline dark:text-marka-400"
        >
          Giriş ekranına dön
        </Link>
      </KimlikDuzeni>
    );
  }

  return (
    <KimlikDuzeni
      baslik="Şifreni mi unuttun?"
      altBaslik="E-posta adresini yaz, sıfırlama bağlantısı gönderelim."
    >
      <form onSubmit={gonder} noValidate className="flex flex-col gap-4">
        {hata instanceof ApiError && hata.problem.errors === undefined && (
          <HataKutusu mesaj={hata.problem.title} />
        )}

        <Alan
          etiket="E-posta"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          hata={eposta.hata}
          {...eposta.bagla}
        />

        <Dugme type="submit" bekliyor={istek.isPending}>
          Sıfırlama bağlantısı gönder
        </Dugme>
      </form>

      <p className="text-sm text-slate-600 dark:text-slate-400">
        Şifreni hatırladın mı?{' '}
        <Link
          to="/giris"
          className="font-medium text-marka-600 hover:underline dark:text-marka-400"
        >
          Giriş yap
        </Link>
      </p>
    </KimlikDuzeni>
  );
}
