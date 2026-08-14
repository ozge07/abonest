import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router';
import { Kabuk } from './components/Kabuk';
import { SiviArkaplan } from './components/SiviArkaplan';
import {
  geriGetirildiMi,
  geriGetirmeNotunuSil,
  useOturum,
} from './lib/oturum';
import { AnaSayfa } from './pages/AnaSayfa';
/*
 * Sahne ayrı bir parçada: three.js tek başına indirilen dosyanın yarısı
 * kadar. Giriş ekranını açan herkese yüklemek yerine yalnızca bu rota
 * açıldığında iniyor.
 */
const Sahne = lazy(async () => {
  const modul = await import('./sahne/Sahne');
  return { default: modul.Sahne };
});
import { AnalizSayfasi } from './pages/AnalizSayfasi';
import { BaglantiylaDogrulama } from './pages/BaglantiylaDogrulama';
import { DogrulamaSayfasi } from './pages/DogrulamaSayfasi';
import { AbonelikSayfasi } from './pages/AbonelikSayfasi';
import { GirisSayfasi, HIKAYE_NOTU } from './pages/GirisSayfasi';
import { HesapSayfasi } from './pages/HesapSayfasi';
import { KayitSayfasi } from './pages/KayitSayfasi';
import { SifreSifirlaSayfasi } from './pages/SifreSifirlaSayfasi';
import { SifreUnuttumSayfasi } from './pages/SifreUnuttumSayfasi';

export function App() {
  const { kullanici, girisYapilmis, yukleniyor } = useOturum();

  if (yukleniyor) {
    // Oturum bilinmeden yönlendirme yapılmıyor: aksi hâlde giriş yapmış
    // kullanıcı bir an giriş ekranını görüp sonra atlıyor.
    return (
      <>
        <SiviArkaplan />
        <TamEkranYukleniyor />
      </>
    );
  }

  if (!girisYapilmis) {
    return (
      <>
        <SiviArkaplan />
        <Routes>
        <Route path="/giris" element={<GirisSayfasi />} />
        <Route path="/kayit" element={<KayitSayfasi />} />
        {/* E-postadaki bağlantı oturum istemiyor: kullanıcı postayı başka
            bir cihazda açmış olabilir. */}
        <Route path="/dogrula" element={<BaglantiylaDogrulama />} />
        {/*
          Şifre sıfırlama oturumsuz çalışmak zorunda: kullanıcı zaten
          giremediği için buraya geliyor. Bu iki rota tanımlı olmadığı
          sürece e-postadaki bağlantı bilinmeyen yol sayılıp giriş
          ekranına düşüyordu — akış uçtan uca hiç çalışmıyordu.
        */}
        <Route path="/sifre-unuttum" element={<SifreUnuttumSayfasi />} />
        <Route path="/sifre-sifirla" element={<SifreSifirlaSayfasi />} />
          <Route path="*" element={<Navigate to="/giris" replace />} />
        </Routes>
      </>
    );
  }

  /*
   * Doğrulanmamış kullanıcı uygulamayı göremiyor.
   *
   * Bütün veri uçları ona `403` dönüyor; içeri alıp her ekranda hata
   * göstermek "bozuk" hissi veriyor ve ne yapması gerektiğini söylemiyor.
   * Tek ekran, tek iş: kodu gir.
   */
  if (kullanici !== null && kullanici.emailVerifiedAt === null) {
    return (
      <>
        <SiviArkaplan />
        <Routes>
          {/* Girişteyken bağlantıya tıklarsa da çalışsın. */}
          <Route path="/dogrula" element={<BaglantiylaDogrulama />} />
          <Route path="*" element={<DogrulamaSayfasi />} />
        </Routes>
      </>
    );
  }

  return (
    <>
      <SiviArkaplan />
      {/*
        Şerit kabuğun **dışında**: girişten sonra hikâye sayfası açılıyor
        ve orada kabuk yok. İçeride kalsaydı hesabını geri getiren
        kullanıcı bu haberi hiç görmezdi.
      */}
      <GeriGetirmeSeridi />
      {/*
        Tek bir rota ağacı.

        Önce iki katmanlıydı: dıştaki `Routes` hikâyeyi, yakalayıcı rotası
        da kabuğu ve onun **kendi** `Routes`'unu çiziyordu. İçteki
        yakalayıcı `/hikaye`'yi tanımıyor ve anında `/`'e geri
        gönderiyordu — hikâye bir an açılıp kapanıyordu. Düzen rotası
        (`Outlet`) aynı işi tek ağaçta yapıyor, o yüzden çakışacak ikinci
        bir yakalayıcı yok.
      */}
      <Routes>
        {/*
          Hikâye kabuğun dışında: kendi başlığı, ızgarası ve 800vh
          kaydırması var, uygulamanın sabit başlık şeridiyle çakışırdı.
        */}
        <Route
          path="/hikaye"
          element={
            <Suspense fallback={<div className="sahne-yedek" aria-hidden />}>
              <Sahne />
            </Suspense>
          }
        />
        <Route element={<KabukDuzeni />}>
          <Route path="/" element={<AnaSayfa />} />
          <Route path="/abonelikler" element={<AbonelikSayfasi />} />
          <Route path="/analiz" element={<AnalizSayfasi />} />
          <Route path="/hesap" element={<HesapSayfasi />} />
          <Route path="*" element={<VarisNoktasi />} />
        </Route>
      </Routes>
    </>
  );
}

/** Kabuk içindeki ekranların ortak düzeni. */
function KabukDuzeni() {
  return (
    <Kabuk>
      <Outlet />
    </Kabuk>
  );
}

function TamEkranYukleniyor() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <p className="text-sm text-slate-500 dark:text-slate-400">Yükleniyor…</p>
    </div>
  );
}

/**
 * "Hesabın geri getirildi" şeridi.
 *
 * Silinmiş bir hesapla giriş yapmak silmeyi geri alıyor. Bunun sessizce
 * olması, kullanıcıyı hesabının hâlâ silinme sırasında olduğunu sanır
 * hâlde bırakırdı — ya da tam tersi, sildiğini unutturur. Şerit bir kez
 * çıkıyor ve kapatılabiliyor.
 */
function GeriGetirmeSeridi() {
  // Not yalnızca **okunuyor**; silme işi efekte bırakılıyor, çünkü
  // StrictMode bileşen gövdesini iki kez çalıştırıyor ve okurken silmek
  // ikinci çalıştırmada haberi kaybederdi.
  const [gorunur, setGorunur] = useState(geriGetirildiMi);

  useEffect(() => {
    geriGetirmeNotunuSil();
  }, []);

  if (!gorunur) {
    return null;
  }

  return (
    <div
      role="status"
      className="sahne-serit flex items-start gap-3 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-800/60 dark:bg-green-950/40 dark:text-green-200"
    >
      <p className="flex-1">
        <strong className="font-semibold">Hesabın geri getirildi.</strong> Silme
        işlemi iptal edildi; aboneliklerin ve geçmişin olduğu gibi duruyor.
      </p>
      <button
        type="button"
        onClick={() => setGorunur(false)}
        aria-label="Kapat"
        className="rounded px-1.5 text-green-700 hover:bg-green-100 dark:text-green-300 dark:hover:bg-green-900/40"
      >
        ✕
      </button>
    </div>
  );
}

/**
 * Tanınmayan adresin varış noktası.
 *
 * Normalde özet ekranı; girişten hemen sonra ise hikâye.
 *
 * ## Neden burada, ayrı bir yönlendirici bileşende değil
 *
 * Önce notu okuyup `navigate('/hikaye')` çağıran ayrı bir bileşen vardı.
 * Çalışmadı: giriş başarılı olduğunda adres hâlâ `/giris` oluyor, o adres
 * hiçbir rotaya uymuyor ve buradaki yakalayıcı rota `/`'e yönlendiriyor.
 * İki yönlendirme aynı işlemede yarışıyor ve sonra çalışan kazanıyor —
 * yakalayıcı rota benim efektimden sonra çalışıp onu eziyordu. Ölçüldü:
 * not okunup siliniyordu ama adres `/` olarak kalıyordu.
 *
 * Kararı yakalayıcı rotanın kendisi verince yarışacak bir şey kalmıyor.
 *
 * Not her mount'ta yeniden okunup siliniyor: kullanıcı sonradan bilinmeyen
 * bir adrese giderse hikâyeye değil özete düşüyor.
 */
function VarisNoktasi() {
  const [hedef] = useState(() =>
    sessionStorage.getItem(HIKAYE_NOTU) !== null ? '/hikaye' : '/',
  );

  useEffect(() => {
    sessionStorage.removeItem(HIKAYE_NOTU);
  }, []);

  return <Navigate to={hedef} replace />;
}
