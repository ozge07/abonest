import { useState } from 'react';
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

  /*
   * Şifre alanında göz düğmesi.
   *
   * Yazdığını göremeden uzun bir şifre girmek hata üretiyor ve kullanıcı
   * neyi yanlış yazdığını anlamıyor. Görünürlük **varsayılan olarak kapalı**:
   * omuz üstünden bakan biri varken şifreyi ekranda tutmak kullanıcının
   * kendi tercihi olmalı, bizim varsayılanımız değil.
   */
  const [gorunur, setGorunur] = useState(false);
  const sifreAlaniMi = rest.type === 'password';

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={alanId} className="text-sm font-medium">
        {etiket}
      </label>

      <div className="relative">
        <input
          id={alanId}
          aria-invalid={hata !== undefined}
          aria-describedby={hata !== undefined ? hataId : undefined}
          className={girdiSinifi(hata !== undefined, sifreAlaniMi)}
          {...rest}
          {...(sifreAlaniMi ? { type: gorunur ? 'text' : 'password' } : {})}
        />

        {sifreAlaniMi && (
          <button
            // `type="button"`: varsayılan `submit` olsaydı göze her
            // tıklayışta form gönderilirdi.
            type="button"
            onClick={() => setGorunur((o) => !o)}
            aria-label={gorunur ? 'Şifreyi gizle' : 'Şifreyi göster'}
            aria-pressed={gorunur}
            // Şifre yöneticileri ve ekran okuyucular için alanın kendisi
            // önemli; düğme sekme sırasında ondan sonra geliyor.
            className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-md text-slate-500 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-marka-500/40 focus-visible:outline-none dark:text-slate-400 dark:hover:text-slate-200"
          >
            <GozSimgesi kapali={gorunur} />
          </button>
        )}
      </div>

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

/**
 * Göz simgesi; şifre görünürken üzeri çizili.
 *
 * `aria-hidden`: anlamı zaten düğmenin `aria-label`'ında, ekran okuyucu aynı
 * şeyi iki kez söylemesin.
 */
function GozSimgesi({ kapali }: { kapali: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7" />
      <circle cx="12" cy="12" r="3" />
      {kapali && <path d="M3 3l18 18" />}
    </svg>
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

function girdiSinifi(hatali: boolean, sagBosluk = false): string {
  return [
    'w-full rounded-md border px-3 py-2 text-sm outline-none transition-colors',
    // Göz düğmesi metnin üstüne binmesin.
    sagBosluk ? 'pr-10' : '',
    'bg-white/5',
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
      // Ekran okuyucuya "bu düğme şu an çalışıyor" diyor; metin
      // değişmediği için tek işaret görsel kalmasın.
      aria-busy={bekliyor}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2',
        'text-sm font-medium transition-colors disabled:opacity-50',
        ikincil
          ? 'border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'
          : /*
             * Amber zeminde **koyu** yazı.
             *
             * Beyaz yazı bu parlaklıkta okunmuyordu: amber açık bir renk,
             * beyazla arasındaki kontrast eşiğin çok altında kalıyor.
             * Hikâye sayfasındaki beyaz hap düğmelerin de yazısı siyah;
             * aynı mantık.
             */
            'bg-marka-600 text-marka-yazi hover:bg-marka-500',
      ].join(' ')}
      {...rest}
    >
      {/*
        Etiket **değişmiyor**, yanına dönen bir halka geliyor.
        
        Önce metin "Bekle…" ile değiştiriliyordu. İki sorunu vardı:
        düğmenin genişliği zıplıyordu ve kullanıcı neye bastığını
        okuyamıyordu — "Giriş yap"a bastıysa hâlâ "Giriş yap" görmeli,
        sadece işin sürdüğünü de anlamalı.
      */}
      {bekliyor && <Donen />}
      {children}
    </button>
  );
}

/**
 * Yükleniyor halkası.
 *
 * `currentColor` kullanıyor: birincil düğmede beyaz, ikincil düğmede
 * metin rengiyle aynı oluyor, ayrıca renk vermek gerekmiyor.
 *
 * `aria-hidden`: durumu zaten `aria-busy` söylüyor, ekran okuyucu aynı
 * şeyi iki kez duymasın.
 */
function Donen() {
  return (
    <svg
      className="donen h-4 w-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
        strokeOpacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
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
