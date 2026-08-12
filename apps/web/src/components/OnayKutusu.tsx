import { useEffect, useRef } from 'react';

/**
 * Geri alınamaz işlemler için onay kutusu.
 *
 * ## Neden tarayıcının `confirm()`'ü değil
 *
 * `window.confirm` ana iş parçacığını kilitliyor, biçimlendirilemiyor ve
 * bazı tarayıcılarda "bu site bir daha sormasın" seçeneğiyle tamamen
 * susturulabiliyor — geri alınamaz bir silmede tam olarak istemediğimiz şey.
 *
 * ## Odak ve klavye
 *
 * Açılınca odak **vazgeç** düğmesine gidiyor: yanlışlıkla Enter'a basan
 * kullanıcı silmiş olmasın. Escape kapatıyor, arka plana tıklamak da.
 * `role="alertdialog"` ekran okuyucuya bunun bir karar anı olduğunu
 * söylüyor.
 */
export function OnayKutusu({
  baslik,
  aciklama,
  onaylaEtiketi = 'Sil',
  tehlikeli = true,
  bekliyor = false,
  onOnayla,
  onVazgec,
}: {
  baslik: string;
  aciklama: string;
  onaylaEtiketi?: string;
  tehlikeli?: boolean;
  bekliyor?: boolean;
  onOnayla: () => void;
  onVazgec: () => void;
}) {
  const vazgecRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    vazgecRef.current?.focus();

    function tusaBasildi(olay: KeyboardEvent) {
      if (olay.key === 'Escape') {
        onVazgec();
      }
    }
    document.addEventListener('keydown', tusaBasildi);
    return () => document.removeEventListener('keydown', tusaBasildi);
  }, [onVazgec]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onMouseDown={(olay) => {
        // Yalnızca arka plana tıklandığında kapanıyor; kutunun içinde
        // metin seçip dışarıda bırakan kullanıcı kaybetmesin.
        if (olay.target === olay.currentTarget) {
          onVazgec();
        }
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="onay-baslik"
        aria-describedby="onay-aciklama"
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      >
        <h2 id="onay-baslik" className="text-base font-semibold">
          {baslik}
        </h2>
        <p
          id="onay-aciklama"
          className="mt-1.5 text-sm text-slate-600 dark:text-slate-400"
        >
          {aciklama}
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={vazgecRef}
            type="button"
            onClick={onVazgec}
            className="rounded-md border border-slate-300 px-3.5 py-2 text-sm font-medium transition-colors hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-marka-500/40 focus-visible:outline-none dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={onOnayla}
            disabled={bekliyor}
            className={[
              'rounded-md px-3.5 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50',
              'focus-visible:ring-2 focus-visible:outline-none',
              tehlikeli
                ? 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-500/40'
                : 'bg-marka-600 hover:bg-marka-700 focus-visible:ring-marka-500/40',
            ].join(' ')}
          >
            {bekliyor ? 'Siliniyor…' : onaylaEtiketi}
          </button>
        </div>
      </div>
    </div>
  );
}
