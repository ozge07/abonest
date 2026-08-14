import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { z } from 'zod';
import { epostaAlani } from '@abonelik/shared';
import { Alan, Dugme, HataKutusu } from '../components/form';
import {
  YorungeHalkalari,
  type GirisAsamasi,
} from '../components/YorungeHalkalari';
import { Imlec, Izgara } from '../sahne/Katmanlar';
import { UYGULAMA_ADI } from '../lib/marka';
import { ApiError } from '../lib/api';
import { useAlan } from '../lib/alan';
import {
  oturumNotu,
  oturumNotunuSil,
  useGiris,
  useOturumuTazele,
} from '../lib/oturum';

/**
 * Girişte şifre kuralı **yok**.
 *
 * Kayıtta alt sınır var ama girişte olmamalı: kurallar sonradan sıkılaşırsa
 * eski şifreli kullanıcılar kendi hesaplarına giremez hâle gelirdi. Sunucu
 * da aynı şekilde davranıyor.
 */
const girisSifresi = z.string().min(1, 'Şifre boş olamaz');

/**
 * Giriş geçişinin zaman çizelgesi (ms).
 *
 * Tek yerde duruyor: CSS'teki süreler bunlarla eşleşmek zorunda ve iki
 * yere ayrı yazılsaydı biri değiştiğinde diğeri sessizce kayardı.
 * Ayrıntılı gerekçe `index.css` içindeki bölümde.
 */
/** Girişten sonra hikâyenin açılacağını söyleyen not. */
export const HIKAYE_NOTU = 'hikaye-goster';

const HIZLANMA_MS = 800;
const TOPLANMA_MS = 700;
/** Işık sönerken uygulama açılıyor; toplam ~3 sn. */
const ACILMA_MS = 1100;

export function GirisSayfasi() {
  const giris = useGiris();
  const oturumuTazele = useOturumuTazele();
  const [asama, setAsama] = useState<GirisAsamasi>('dinlenme');

  /*
   * Başarılı girişten sonra sıra: hızlan → topla + ışık → aç.
   *
   * Uygulama en sonda açılıyor. Hemen açılsaydı giriş ekranı sökülür ve
   * animasyon yarıda kesilirdi; bu yüzden `useGiris` artık kendiliğinden
   * tazelemiyor, kararı buradaki zaman çizelgesi veriyor.
   *
   * Hareketi azaltmak isteyen kullanıcıda animasyon hiç oynamıyor:
   * ekranı üç saniye kaplayan bir efekt, kısılacak bir süsleme değil.
   */
  useEffect(() => {
    if (!giris.isSuccess) {
      return;
    }

    // `?.` — tarayıcı dışı ortamlarda (ve eski istemcilerde) bu API
    // olmayabiliyor; yokluğunda animasyon oynatmak çökmekten iyidir.
    const azalt =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    if (azalt) {
      sessionStorage.setItem(HIKAYE_NOTU, '1');
      void oturumuTazele();
      return;
    }

    const zamanlayicilar = [
      window.setTimeout(() => setAsama('hizlanma'), 0),
      window.setTimeout(() => setAsama('toplanma'), HIZLANMA_MS),
      window.setTimeout(() => {
        /*
         * Hikâye bir **not** bırakılarak açılıyor, doğrudan yönlendirme
         * ile değil.
         *
         * Buradan `/hikaye`'ye gitmeyi denedim: oturum henüz
         * tazelenmediği için uygulama hâlâ giriş ekranı ağacındaydı ve
         * oradaki yakalayıcı rota adresi anında `/giris`'e geri
         * çeviriyordu. Yönlendirmeyi oturum açıldıktan sonra yapan taraf
         * karar veriyor.
         */
        sessionStorage.setItem(HIKAYE_NOTU, '1');
        sessionStorage.setItem('kabuk-girisi', '1');
        void oturumuTazele();
      }, HIZLANMA_MS + TOPLANMA_MS + ACILMA_MS),
    ];

    return () => {
      zamanlayicilar.forEach(window.clearTimeout);
    };
  }, [giris.isSuccess, oturumuTazele]);

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
    <KimlikDuzeni
      baslik="Giriş yap"
      altBaslik="Aboneliklerini görmek için giriş yap."
      asama={asama}
    >
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

/**
 * Kimlik ekranlarının ortak çerçevesi: solda yörünge, sağda cam kart.
 *
 * Beş ekran bunu paylaşıyor (giriş, kayıt, doğrulama, şifre sıfırlama),
 * yani değişen tek şey kartın içi.
 *
 * ## Hikâyeyle aynı tema, hikâyenin ağırlığı olmadan
 *
 * Sinematik sahne girişten **sonraya** taşındı: burada 800vh kaydırma ve
 * three.js yok. Ortak olan görsel dil — koyu zemin, ince mimari ızgara,
 * Italiana marka yazısı, Playfair başlık, cam kart ve özel imleç. İki
 * ekran arasında geçerken kimse başka bir uygulamaya girdiğini
 * düşünmüyor, ama giriş ekranı hâlâ hafif.
 *
 * Dar ekranda yörünge gizleniyor — 390 pikselde iki sütun yan yana
 * durmuyor ve asıl iş formda.
 */
export function KimlikDuzeni({
  baslik,
  altBaslik,
  children,
  asama = 'dinlenme',
}: {
  baslik: string;
  altBaslik: string;
  children: ReactNode;
  asama?: GirisAsamasi;
}) {
  return (
    <div className={`kimlik kimlik-${asama}`}>
      {/*
        Işık patlaması düzenin kökünde, kartın içinde değil: kartın
        `backdrop-filter`'ı `position: fixed` için kapsayıcı blok
        üretiyor ve ışık kartın kutusuna hapsoluyordu.
      */}
      {asama === 'toplanma' && <div className="giris-isigi" aria-hidden />}

      <Izgara dar={false} />
      <Imlec />

      <div className="kimlik-marka">
        <img src="/logo.svg?v=3" alt="" width={26} height={26} className="rounded-lg" />
        <span className="sahne-marka">{UYGULAMA_ADI}</span>
      </div>

      {/*
        Yörünge ekranı kaplıyor ve tıklamaları geçiriyor: arkasındaki
        forma erişimi engellememesi gerekiyor.
      */}
      <div className="kimlik-yorunge" aria-hidden>
        <YorungeHalkalari asama={asama} />
      </div>

      <div className="kimlik-kart">
        <div className="mb-5">
          <h1 className="kimlik-baslik">{baslik}</h1>
          <p className="mt-1 text-sm text-slate-400">{altBaslik}</p>
        </div>

        {/*
          Saydam cam değil opak: yörünge artık ekranı kapladığı için
          diskler kartın ardından geçiyor ve alan etiketleri okunmuyordu.
        */}
        <div className="cam-opak flex flex-col gap-5 rounded-2xl p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
