import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { useCikis, useOturum } from '../lib/oturum';

/** Giriş yapmış kullanıcının gördüğü çerçeve: başlık, gezinme, içerik. */
export function Kabuk({ children }: { children: ReactNode }) {
  const { kullanici } = useOturum();
  const cikis = useCikis();

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
          <span className="text-base font-semibold">Abonelik Takip</span>

          <nav className="flex gap-1">
            <Baglanti to="/">Özet</Baglanti>
            <Baglanti to="/abonelikler">Abonelikler</Baglanti>
          </nav>

          <div className="ml-auto flex items-center gap-3">
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

      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
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
