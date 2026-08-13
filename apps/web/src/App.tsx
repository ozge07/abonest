import { Navigate, Route, Routes } from 'react-router';
import { Kabuk } from './components/Kabuk';
import { TemaArkaplani } from './components/TemaArkaplani';
import { useOturum } from './lib/oturum';
import { AnaSayfa } from './pages/AnaSayfa';
import { AnalizSayfasi } from './pages/AnalizSayfasi';
import { BaglantiylaDogrulama } from './pages/BaglantiylaDogrulama';
import { DogrulamaSayfasi } from './pages/DogrulamaSayfasi';
import { AbonelikSayfasi } from './pages/AbonelikSayfasi';
import { GirisSayfasi } from './pages/GirisSayfasi';
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
        <TemaArkaplani />
        <TamEkranYukleniyor />
      </>
    );
  }

  if (!girisYapilmis) {
    return (
      <>
        <TemaArkaplani />
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
        <TemaArkaplani />
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
      <TemaArkaplani />
      <Kabuk>
      <Routes>
        <Route path="/" element={<AnaSayfa />} />
        <Route path="/abonelikler" element={<AbonelikSayfasi />} />
        <Route path="/analiz" element={<AnalizSayfasi />} />
        <Route path="/hesap" element={<HesapSayfasi />} />
        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Kabuk>
    </>
  );
}

function TamEkranYukleniyor() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <p className="text-sm text-slate-500 dark:text-slate-400">Yükleniyor…</p>
    </div>
  );
}
