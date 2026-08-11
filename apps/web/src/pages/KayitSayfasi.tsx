import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Alan, Dugme, HataKutusu } from '../components/form';
import { ApiError } from '../lib/api';
import { useGiris, useKayit } from '../lib/oturum';
import { KimlikDuzeni } from './GirisSayfasi';

export function KayitSayfasi() {
  const kayit = useKayit();
  const giris = useGiris();
  const [ad, setAd] = useState('');
  const [email, setEmail] = useState('');
  const [sifre, setSifre] = useState('');

  const hata = kayit.error ?? giris.error;
  const alanHatalari = hata instanceof ApiError ? hata.alanHatalari : {};
  const bekliyor = kayit.isPending || giris.isPending;

  function gonder(olay: FormEvent) {
    olay.preventDefault();
    // Kayıttan sonra kullanıcıyı bir de giriş formuna göndermenin anlamı yok;
    // bilgileri az önce yazdı.
    kayit.mutate(
      { email, password: sifre, name: ad },
      { onSuccess: () => giris.mutate({ email, password: sifre }) },
    );
  }

  return (
    <KimlikDuzeni
      baslik="Kayıt ol"
      altBaslik="Aboneliklerini tek yerden takip etmeye başla."
    >
      <form onSubmit={gonder} className="flex flex-col gap-4">
        {hata instanceof ApiError && hata.problem.errors === undefined && (
          <HataKutusu mesaj={hata.problem.title} />
        )}

        <Alan
          etiket="Ad"
          name="name"
          autoComplete="name"
          required
          value={ad}
          onChange={(o) => setAd(o.target.value)}
          hata={alanHatalari['name']}
        />

        <Alan
          etiket="E-posta"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(o) => setEmail(o.target.value)}
          hata={alanHatalari['email']}
        />

        <Alan
          etiket="Şifre"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={sifre}
          onChange={(o) => setSifre(o.target.value)}
          hata={alanHatalari['password']}
          ipucu="En az 12 karakter."
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
