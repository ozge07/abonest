import { type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { sifreAlani } from '@abonelik/shared';
import { Alan, Dugme, HataKutusu } from '../components/form';
import { ApiError, api } from '../lib/api';
import { useAlan } from '../lib/alan';
import { KimlikDuzeni } from './GirisSayfasi';

/**
 * E-postadaki bağlantıdan gelinen ekran: yeni şifre.
 *
 * Bu rota **yoktu**. Sunucu sıfırlama postasını `/sifre-sifirla?token=…`
 * adresine gönderiyordu ama arayüzde o adres tanımlı değildi; bağlantı
 * bilinmeyen yol sayılıp giriş ekranına düşüyordu. Yani şifre sıfırlama
 * uçtan uca hiç çalışmıyordu — uçlar ve e-posta hazır olduğu için de
 * sunucu tarafına bakan biri sorunu göremezdi.
 *
 * Oturum istemiyor: kullanıcı zaten giremediği için buraya geliyor.
 * Yetkiyi jeton veriyor.
 */
export function SifreSifirlaSayfasi() {
  const [parametreler] = useSearchParams();
  const jeton = parametreler.get('token') ?? '';

  const sifirla = useMutation({
    mutationFn: (password: string) =>
      api.post<void>('/auth/reset-password', { token: jeton, password }),
  });

  const hata = sifirla.error;
  const sunucuHatalari = hata instanceof ApiError ? hata.alanHatalari : {};
  const sifre = useAlan(sifreAlani, sunucuHatalari['password']);

  function gonder(olay: FormEvent) {
    olay.preventDefault();
    sifre.gonderildi();
    if (!sifre.gecerli) {
      return;
    }
    sifirla.mutate(sifre.deger);
  }

  /*
   * Jetonsuz gelinmişse form gösterilmiyor.
   *
   * Boş jetonla gönderim sunucudan 422 alırdı; kullanıcıya şifresini boşuna
   * yazdırıp sonra hata göstermek yerine durumu baştan söylüyoruz.
   */
  if (jeton === '') {
    return (
      <KimlikDuzeni
        baslik="Bağlantı eksik"
        altBaslik="Bu adres bir sıfırlama kodu taşımıyor."
      >
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Postadaki bağlantıyı olduğu gibi açtığından emin ol. Bağlantı
          bozulduysa yenisini isteyebilirsin.
        </p>
        <Link
          to="/sifre-unuttum"
          className="text-sm font-medium text-marka-600 hover:underline dark:text-marka-400"
        >
          Yeni bağlantı iste
        </Link>
      </KimlikDuzeni>
    );
  }

  if (sifirla.isSuccess) {
    return (
      <KimlikDuzeni
        baslik="Şifren değişti"
        altBaslik="Artık yeni şifrenle girebilirsin."
      >
        {/*
          Sunucu bütün oturumları düşürüyor: sıfırlama isteniyorsa hesabın
          ele geçirilmiş olma ihtimali var ve saldırganın açık oturumu da
          kapanmalı. Kullanıcının bunu bilmesi, "neden diğer cihazımdan
          çıktım" sorusunu baştan cevaplıyor.
        */}
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Güvenlik için bütün cihazlardaki oturumların kapatıldı; hepsinde
          yeniden giriş yapman gerekiyor.
        </p>
        <Link
          to="/giris"
          className="text-sm font-medium text-marka-600 hover:underline dark:text-marka-400"
        >
          Giriş yap
        </Link>
      </KimlikDuzeni>
    );
  }

  return (
    <KimlikDuzeni
      baslik="Yeni şifre belirle"
      altBaslik="Bundan sonra bu şifreyle gireceksin."
    >
      <form onSubmit={gonder} noValidate className="flex flex-col gap-4">
        {hata instanceof ApiError && hata.problem.errors === undefined && (
          <>
            <HataKutusu mesaj={hata.problem.title} />
            {/*
              Süresi dolmuş ya da kullanılmış jetonda çıkış yolu gösteriliyor;
              yoksa kullanıcı ekranda kilitli kalıyor.
            */}
            <Link
              to="/sifre-unuttum"
              className="text-sm font-medium text-marka-600 hover:underline dark:text-marka-400"
            >
              Yeni bağlantı iste
            </Link>
          </>
        )}

        <Alan
          etiket="Yeni şifre"
          name="password"
          type="password"
          autoComplete="new-password"
          autoFocus
          required
          hata={sifre.hata}
          {...sifre.bagla}
        />

        <Dugme type="submit" bekliyor={sifirla.isPending}>
          Şifreyi değiştir
        </Dugme>
      </form>
    </KimlikDuzeni>
  );
}
