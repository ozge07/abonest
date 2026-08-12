import { type FormEvent } from 'react';
import { Link } from 'react-router';
import { adAlani, epostaAlani, SIFRE_MIN, sifreAlani } from '@abonelik/shared';
import { Alan, Dugme, HataKutusu } from '../components/form';
import { ApiError } from '../lib/api';
import { useAlan } from '../lib/alan';
import { useGiris, useKayit } from '../lib/oturum';
import { KimlikDuzeni } from './GirisSayfasi';

export function KayitSayfasi() {
  const kayit = useKayit();
  const giris = useGiris();

  const hata = kayit.error ?? giris.error;
  const sunucuHatalari = hata instanceof ApiError ? hata.alanHatalari : {};

  const ad = useAlan(adAlani, sunucuHatalari['name']);
  const eposta = useAlan(epostaAlani, sunucuHatalari['email']);
  const sifre = useAlan(sifreAlani, sunucuHatalari['password']);

  const bekliyor = kayit.isPending || giris.isPending;

  function gonder(olay: FormEvent) {
    olay.preventDefault();
    // Henüz dokunulmamış alanların hataları da görünsün.
    ad.gonderildi();
    eposta.gonderildi();
    sifre.gonderildi();

    if (!ad.gecerli || !eposta.gecerli || !sifre.gecerli) {
      return;
    }

    // Kayıttan sonra kullanıcıyı bir de giriş formuna göndermenin anlamı yok;
    // bilgileri az önce yazdı.
    kayit.mutate(
      { email: eposta.deger, password: sifre.deger, name: ad.deger },
      {
        onSuccess: () =>
          giris.mutate({ email: eposta.deger, password: sifre.deger }),
      },
    );
  }

  return (
    <KimlikDuzeni
      baslik="Kayıt ol"
      altBaslik="Aboneliklerini tek yerden takip etmeye başla."
    >
      {/* `noValidate`: doğrulamayı biz yapıyoruz. Tarayıcının kendi balonu
          hem Türkçe olmayabiliyor hem de bizim mesajımızla çelişiyor. */}
      <form onSubmit={gonder} noValidate className="flex flex-col gap-4">
        {hata instanceof ApiError && hata.problem.errors === undefined && (
          <HataKutusu mesaj={hata.problem.title} />
        )}

        <Alan
          etiket="Ad"
          name="name"
          autoComplete="name"
          required
          hata={ad.hata}
          {...ad.bagla}
        />

        <Alan
          etiket="E-posta"
          name="email"
          type="email"
          autoComplete="email"
          required
          hata={eposta.hata}
          {...eposta.bagla}
        />

        <Alan
          etiket="Şifre"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          hata={sifre.hata}
          ipucu={`En az ${SIFRE_MIN} karakter.`}
          {...sifre.bagla}
        />

        <Dugme type="submit" bekliyor={bekliyor}>
          Hesap oluştur
        </Dugme>
      </form>

      <p className="text-sm text-slate-600 dark:text-slate-400">
        Hesabın var mı?{' '}
        <Link to="/giris" className="font-medium text-marka-600 hover:underline">
          Giriş yap
        </Link>
      </p>
    </KimlikDuzeni>
  );
}
