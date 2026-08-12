import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router';
import { UYGULAMA_ADI } from '../lib/marka';
import {
  geriGetirildiMi,
  geriGetirmeNotunuSil,
  useCikis,
  useOturum,
} from '../lib/oturum';
import { BildirimZili } from './BildirimZili';

/** Giriş yapmış kullanıcının gördüğü çerçeve: başlık, gezinme, içerik. */
export function Kabuk({ children }: { children: ReactNode }) {
  const { kullanici } = useOturum();
  const cikis = useCikis();

  return (
    <div className="min-h-dvh text-slate-900 dark:text-slate-100">
      {/*
        * Buzlu cam: tema arka planı başlığın altından geçiyor ve sayfa
        * kaydırıldıkça hafifçe değişiyor. Opak bir şerit temayı ikiye
        * bölüyordu.
        */}
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/75 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/70">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
          <NavLink to="/" className="flex shrink-0 items-center gap-2">
            <img
              src="/logo.svg"
              alt=""
              width={28}
              height={28}
              className="rounded-lg"
            />
            <span className="text-base font-semibold">{UYGULAMA_ADI}</span>
          </NavLink>

          <nav className="flex gap-1">
            <Baglanti to="/">Özet</Baglanti>
            <Baglanti to="/abonelikler">Abonelikler</Baglanti>
            <Baglanti to="/analiz">Analiz</Baglanti>
            {/*
              * Hesap ayarları gezinmede açıkça duruyor. Yalnızca kullanıcı
              * adına gizlenmiş bir bağlantı olsaydı, hesabını silmek isteyen
              * kullanıcı nereye tıklayacağını bulamazdı — bulamadı da.
              */}
            <Baglanti to="/hesap">Hesabım</Baglanti>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <BildirimZili />
            <span className="hidden text-sm text-slate-500 sm:inline dark:text-slate-400">
              {kullanici?.name}
            </span>
            <button
              type="button"
              onClick={() => cikis.mutate()}
              disabled={cikis.isPending}
              className="rounded-md px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Çıkış
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <GeriGetirmeSeridi />
        {children}
      </main>
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
      className="mb-6 flex items-start gap-3 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-800/60 dark:bg-green-950/40 dark:text-green-200"
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

function Baglanti({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        [
          'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
          isActive
            ? 'bg-marka-100 text-marka-700 dark:bg-marka-700/20 dark:text-marka-100'
            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
        ].join(' ')
      }
    >
      {children}
    </NavLink>
  );
}
