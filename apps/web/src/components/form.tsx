import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';

/**
 * Form parçaları.
 *
 * Hata mesajı girdinin **altında** ve girdiye `aria-describedby` ile bağlı:
 * ekran okuyucu kullanıcı hangi alanın neden reddedildiğini duyuyor. Sadece
 * kırmızı çerçeve çizmek, rengi ayırt edemeyen kullanıcıya hiçbir şey
 * söylemez.
 */

interface AlanProps extends InputHTMLAttributes<HTMLInputElement> {
  etiket: string;
  hata?: string | undefined;
  ipucu?: string | undefined;
}

export function Alan({ etiket, hata, ipucu, id, ...rest }: AlanProps) {
  const alanId = id ?? rest.name ?? etiket;
  const hataId = `${alanId}-hata`;


  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={alanId} className="text-sm font-medium">
        {etiket}
      </label>
      <input
        id={alanId}
        aria-invalid={hata !== undefined}
        aria-describedby={hata !== undefined ? hataId : undefined}
        className={girdiSinifi(hata !== undefined)}
        {...rest}
      />
      {ipucu !== undefined && hata === undefined && (
        <p className="text-xs text-slate-500 dark:text-slate-400">{ipucu}</p>
      )}
      {hata !== undefined && (
        <p id={hataId} className="text-xs text-red-600 dark:text-red-400">
          {hata}
        </p>
      )}
    </div>
  );
}

interface SecimProps extends SelectHTMLAttributes<HTMLSelectElement> {
  etiket: string;
  hata?: string | undefined;
  children: ReactNode;
}

export function Secim({ etiket, hata, id, children, ...rest }: SecimProps) {
  const alanId = id ?? rest.name ?? etiket;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={alanId} className="text-sm font-medium">
        {etiket}
      </label>
      <select id={alanId} className={girdiSinifi(hata !== undefined)} {...rest}>
        {children}
      </select>
      {hata !== undefined && (
        <p className="text-xs text-red-600 dark:text-red-400">{hata}</p>
      )}
    </div>
  );
}

function girdiSinifi(hatali: boolean): string {
  return [
    'rounded-md border px-3 py-2 text-sm outline-none transition-colors',
    'bg-white dark:bg-slate-900',
    'focus:ring-2 focus:ring-marka-500/40',
    hatali
      ? 'border-red-400 focus:border-red-500'
      : 'border-slate-300 focus:border-marka-500 dark:border-slate-700',
  ].join(' ');
}

export function Dugme({
  children,
  bekliyor = false,
  ikincil = false,
  ...rest
}: {
  children: ReactNode;
  bekliyor?: boolean;
  ikincil?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      disabled={bekliyor || rest.disabled}
      className={[
        'rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50',
        ikincil
          ? 'border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'
          : 'bg-marka-600 text-white hover:bg-marka-700',
      ].join(' ')}
      {...rest}
    >
      {bekliyor ? 'Bekle…' : children}
    </button>
  );
}

/** Sunucudan gelen, alana bağlanamayan hata. */
export function HataKutusu({ mesaj }: { mesaj: string }) {
  return (
    <p
      role="alert"
      className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
    >
      {mesaj}
    </p>
  );
}
