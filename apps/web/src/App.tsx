import { Navigate, Route, Routes } from 'react-router';
import { Kabuk } from './components/Kabuk';
import { useOturum } from './lib/oturum';
import { AnaSayfa } from './pages/AnaSayfa';
import { AbonelikSayfasi } from './pages/AbonelikSayfasi';
import { GirisSayfasi } from './pages/GirisSayfasi';
import { KayitSayfasi } from './pages/KayitSayfasi';

export function App() {
  const { girisYapilmis, yukleniyor } = useOturum();

  if (yukleniyor) {
    // Oturum bilinmeden yönlendirme yapılmıyor: aksi hâlde giriş yapmış
    // kullanıcı bir an giriş ekranını görüp sonra atlıyor.
    return <TamEkranYukleniyor />;
  }

  if (!girisYapilmis) {
    return (
      <Routes>
        <Route path="/giris" element={<GirisSayfasi />} />
        <Route path="/kayit" element={<KayitSayfasi />} />
        <Route path="*" element={<Navigate to="/giris" replace />} />
      </Routes>
    );
  }

  return (
    <Kabuk>
      <Routes>
        <Route path="/" element={<AnaSayfa />} />
        <Route path="/abonelikler" element={<AbonelikSayfasi />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Kabuk>
  );
}

function TamEkranYukleniyor() {
  return (
    <div className="grid min-h-dvh place-items-center bg-slate-50 dark:bg-slate-950">
      <p className="text-sm text-slate-500 dark:text-slate-400">Yükleniyor…</p>
    </div>
  );
}
