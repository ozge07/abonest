import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Alan, Dugme, HataKutusu } from '../components/form';
import { ApiError } from '../lib/api';
import { useGiris } from '../lib/oturum';

export function GirisSayfasi() {
  const giris = useGiris();
  const [email, setEmail] = useState('');
  const [sifre, setSifre] = useState('');

  const hata = giris.error;
  const alanHatalari = hata instanceof ApiError ? hata.alanHatalari : {};

  function gonder(olay: FormEvent) {
    olay.preventDefault();
    giris.mutate({ email, password: sifre });
  }

  return (
    <KimlikDuzeni baslik="Giriş yap" altBaslik="Aboneliklerini görmek için giriş yap.">
      <form onSubmit={gonder} className="flex flex-col gap-4">
        {hata instanceof ApiError && hata.problem.errors === undefined && (
          <HataKutusu mesaj={hata.problem.title} />
        )}

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
          autoComplete="current-password"
          required
          value={sifre}
          onChange={(o) => setSifre(o.target.value)}
          hata={alanHatalari['password']}
        />

        <Dugme type="submit" bekliyor={giris.isPending}>
          Giriş yap
        </Dugme>
      </form>

      <p className="text-sm text-slate-600 dark:text-slate-400">
        Hesabın yok mu?{' '}
        <Link to="/kayit" className="font-medium text-marka-600 hover:underline">
          Kayıt ol
        </Link>
      </p>
    </KimlikDuzeni>
  );
}

export function KimlikDuzeni({
  baslik,
  altBaslik,
  children,
}: {
  baslik: string;
  altBaslik: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh place-items-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {baslik}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {altBaslik}
          </p>
        </div>

        <div className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          {children}
        </div>
      </div>
    </div>
  );
}
