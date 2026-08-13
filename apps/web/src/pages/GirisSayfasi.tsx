import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { z } from 'zod';
import { epostaAlani } from '@abonelik/shared';
import { Alan, Dugme, HataKutusu } from '../components/form';
import { ApiError } from '../lib/api';
import { useAlan } from '../lib/alan';
import { oturumNotu, oturumNotunuSil, useGiris } from '../lib/oturum';

/**
 * Girişte şifre kuralı **yok**.
 *
 * Kayıtta alt sınır var ama girişte olmamalı: kurallar sonradan sıkılaşırsa
 * eski şifreli kullanıcılar kendi hesaplarına giremez hâle gelirdi. Sunucu
 * da aynı şekilde davranıyor.
 */
const girisSifresi = z.string().min(1, 'Şifre boş olamaz');

export function GirisSayfasi() {
  const giris = useGiris();

  // Not yalnızca okunuyor; silme işi efekte bırakılıyor, çünkü StrictMode
  // bileşen gövdesini iki kez çalıştırıyor ve okurken silmek ikinci
  // çalıştırmada notu kaybederdi.
  const [not] = useState(oturumNotu);
  useEffect(() => {
    oturumNotunuSil();
  }, []);

  const hata = giris.error;
  const sunucuHatalari = hata instanceof ApiError ? hata.alanHatalari : {};

  const eposta = useAlan(epostaAlani, sunucuHatalari['email']);
  const sifre = useAlan(girisSifresi, sunucuHatalari['password']);

  function gonder(olay: FormEvent) {
    olay.preventDefault();
    eposta.gonderildi();
    sifre.gonderildi();

    if (!eposta.gecerli || !sifre.gecerli) {
      return;
    }

    giris.mutate({ email: eposta.deger, password: sifre.deger });
  }

  return (
    <KimlikDuzeni baslik="Giriş yap" altBaslik="Aboneliklerini görmek için giriş yap.">
      {/*
        Kırmızı değil nötr: bu bir hata değil, olağan bir güvenlik
        davranışı. Kırmızı kutu kullanıcıya "bir şey ters gitti"
        dedirtirdi.
      */}
      {not !== null && (
        <p
          role="status"
          className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          {not}. Devam etmek için tekrar giriş yap.
        </p>
      )}

      <form onSubmit={gonder} noValidate className="flex flex-col gap-4">
        {hata instanceof ApiError && hata.problem.errors === undefined && (
          <HataKutusu mesaj={hata.problem.title} />
        )}

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
          autoComplete="current-password"
          required
          hata={sifre.hata}
          {...sifre.bagla}
        />

        <Dugme type="submit" bekliyor={giris.isPending}>
          Giriş yap
        </Dugme>

        {/*
          Düğmenin altında: kullanıcı buraya ancak giriş denemesi
          başarısız olduktan sonra bakıyor, formun üstünde olsaydı asıl
          işten önce dikkat dağıtırdı.
        */}
        <Link
          to="/sifre-unuttum"
          className="self-start text-sm text-slate-600 hover:underline dark:text-slate-400"
        >
          Şifremi unuttum
        </Link>
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
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {baslik}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {altBaslik}
          </p>
        </div>

        <div className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white/80 backdrop-blur-xl p-6 dark:border-slate-800 dark:bg-slate-900/70">
          {children}
        </div>
      </div>
    </div>
  );
}
