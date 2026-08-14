import { useState } from 'react';
import { MarkaKarosu } from './MarkaKarosu';
import type { Saglayici } from '../lib/types';

/**
 * Sağlayıcı seçici.
 *
 * Açılır liste (`<select>`) yerine ızgara: HTML'in kendi açılır listesi
 * görsel taşıyamıyor ve otuz markayı düz metin olarak okumak, logosuna
 * bakarak tanımaktan çok daha yavaş. Kullanıcı "Netflix" kelimesini aramıyor,
 * kırmızı kutuyu arıyor.
 *
 * Arama kutusu var çünkü otuz öğe ekranı doldurmadan taranamıyor; yazmaya
 * başlayınca liste daralıyor.
 */
export function SaglayiciSecici({
  saglayicilar,
  seciliId,
  onSec,
}: {
  saglayicilar: Saglayici[];
  seciliId: string;
  onSec: (saglayici: Saglayici | null) => void;
}) {
  const [arama, setArama] = useState('');

  const suzulmus = saglayicilar.filter((saglayici) =>
    // Türkçe karşılaştırma: "İ" ile "i" eşleşsin.
    saglayici.name.toLocaleLowerCase('tr').includes(arama.toLocaleLowerCase('tr')),
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">Hangi servis?</span>
        {seciliId !== '' && (
          <button
            type="button"
            onClick={() => onSec(null)}
            className="text-xs text-slate-500 hover:underline dark:text-slate-400"
          >
            Seçimi kaldır
          </button>
        )}
      </div>

      <input
        type="search"
        value={arama}
        onChange={(olay) => setArama(olay.target.value)}
        placeholder="Ara ya da aşağıdan seç"
        aria-label="Servis ara"
        className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none transition-colors focus:border-marka-500 focus:ring-2 focus:ring-marka-500/40"
      />

      {suzulmus.length === 0 ? (
        <p className="rounded-md bg-slate-50 px-3 py-4 text-center text-sm text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
          Eşleşen servis yok — adını aşağıya kendin yazabilirsin.
        </p>
      ) : (
        <ul
          // Yükseklik sınırlı: seçici formun tamamını itip kaydırmasın.
          className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto rounded-md border border-white/10 p-1.5 sm:grid-cols-3"
        >
          {suzulmus.map((saglayici) => {
            const secili = saglayici.id === seciliId;
            return (
              <li key={saglayici.id}>
                <button
                  type="button"
                  onClick={() => onSec(secili ? null : saglayici)}
                  aria-pressed={secili}
                  className={[
                    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-all',
                    'focus-visible:ring-2 focus-visible:ring-marka-500/40 focus-visible:outline-none',
                    secili
                      ? 'bg-marka-50 ring-2 ring-marka-500 dark:bg-marka-700/20'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800',
                  ].join(' ')}
                >
                  <MarkaKarosu
                    ad={saglayici.name}
                    renk={saglayici.color}
                    logo={saglayici.logoUrl}
                    boyut="kucuk"
                  />
                  <span className="truncate text-xs font-medium">
                    {saglayici.name}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
