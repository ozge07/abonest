import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router';
import { api } from '../lib/api';
import { gunSayisiYaz, paraYaz, tarihYaz } from '../lib/money';
import type { Ozet } from '../lib/types';

/**
 * Ana ekran — üç soruyu cevaplıyor: **ne kadar gidiyor, sırada ne var, nereye
 * gidiyor.**
 *
 * Tek API çağrısı. Beş ayrı istek atmak yavaş ağda ekranın parça parça
 * dolmasına ve düzenin zıplamasına yol açardı.
 */
export function AnaSayfa() {
  const sorgu = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<Ozet>('/dashboard'),
  });

  if (sorgu.isPending) {
    return <Iskelet />;
  }

  if (sorgu.isError || sorgu.data === undefined) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">
        Özet yüklenemedi. Sayfayı yenilemeyi dene.
      </p>
    );
  }

  const ozet = sorgu.data;

  /*
   * Aboneliği olmayan kullanıcıya özet gösterilmiyor.
   *
   * Boş bir "aylık giderin ₺0" ekranı kimseye bir şey söylemiyor; o
   * kullanıcının yapması gereken tek şey ilk aboneliğini eklemek ve o iş
   * abonelikler sayfasında. Yeni kayıt olan herkesin ilk gördüğü ekran
   * burası olduğu için fark ediliyor.
   */
  if (ozet.activeCount === 0) {
    return <Navigate to="/abonelikler" replace />;
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <BolumBasligi>Aylık gideri</BolumBasligi>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ozet.totals.map((toplam) => (
            <Kart key={toplam.currency}>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {toplam.currency} · aylık
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {paraYaz(toplam.monthlyMinor, toplam.currency)}
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                yılda {paraYaz(toplam.yearlyMinor, toplam.currency)}
              </p>
            </Kart>
          ))}
        </div>
        {ozet.totals.length > 1 && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Para birimleri toplanmıyor — kur uydurmak yerine ayrı gösteriyoruz.
          </p>
        )}
      </section>

      <section>
        <BolumBasligi>Sırada ne var</BolumBasligi>
        {ozet.upcoming.length === 0 ? (
          <Kart>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Önümüzdeki 30 günde ödeme görünmüyor.
            </p>
          </Kart>
        ) : (
          <Kart yatayDoldur>
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {ozet.upcoming.map((odeme) => (
                <li
                  key={`${odeme.subscriptionId}-${odeme.dueDate}`}
                  className="flex items-center gap-4 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{odeme.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {tarihYaz(odeme.dueDate)}
                    </p>
                  </div>
                  <span
                    className={[
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      odeme.daysUntil <= 3
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                    ].join(' ')}
                  >
                    {gunSayisiYaz(odeme.daysUntil)}
                  </span>
                  <span className="w-28 text-right text-sm font-medium tabular-nums">
                    {paraYaz(odeme.amountMinor, odeme.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </Kart>
        )}
      </section>

      <section>
        <BolumBasligi>Nereye gidiyor</BolumBasligi>
        {/*
         * Para birimi başına ayrı liste. Tek düz listede aynı kategori iki
         * kez görünüyordu — bir kez %9, bir kez %100 — ve yan yana duran
         * çubuklar "en büyük kalemim bu" diye okunuyordu. Oysa paylar kendi
         * para birimi içinde hesaplanıyor; farklı listelerin yüzdeleri
         * karşılaştırılabilir değil.
         */}
        <div className="flex flex-col gap-4">
          {paraBirimineGoreAyir(ozet.byCategory).map(([currency, satirlar]) => (
            <div key={currency}>
              {ozet.totals.length > 1 && (
                <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  {currency} harcaması
                </p>
              )}
              <Kart yatayDoldur>
                <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                  {satirlar.map((kategori) => (
                    <li key={kategori.categoryId} className="px-4 py-3">
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-sm font-medium">
                          {kategori.name}
                        </span>
                        <span className="text-sm tabular-nums">
                          {paraYaz(kategori.monthlyMinor, kategori.currency)}
                          <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                            %{Math.round(kategori.share * 100)}
                          </span>
                        </span>
                      </div>
                      {/* Oran çubuğu: sayıyı okumadan da dağılım görünüyor. */}
                      <div
                        className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                        role="presentation"
                      >
                        <div
                          className="h-full rounded-full bg-marka-500"
                          style={{
                            width: `${Math.max(kategori.share * 100, 2)}%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </Kart>
            </div>
          ))}
        </div>
      </section>

      {ozet.cancelledThisMonth > 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Bu ay {ozet.cancelledThisMonth} aboneliği iptal ettin.
        </p>
      )}
    </div>
  );
}

/** Kategori satırlarını para birimine göre kümeliyor; sunucu sırasını koruyor. */
function paraBirimineGoreAyir(
  satirlar: Ozet['byCategory'],
): [string, Ozet['byCategory']][] {
  const gruplar = new Map<string, Ozet['byCategory']>();
  for (const satir of satirlar) {
    const grup = gruplar.get(satir.currency);
    if (grup === undefined) {
      gruplar.set(satir.currency, [satir]);
    } else {
      grup.push(satir);
    }
  }
  return [...gruplar];
}

function BolumBasligi({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-sm font-semibold text-slate-500 uppercase dark:text-slate-400">
      {children}
    </h2>
  );
}

function Kart({
  children,
  yatayDoldur = false,
}: {
  children: React.ReactNode;
  yatayDoldur?: boolean;
}) {
  return (
    <div
      className={[
        'rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900',
        yatayDoldur ? '' : 'p-4',
      ].join(' ')}
    >
      {children}
    </div>
  );
}

function Iskelet() {
  // Boş ekran yerine yer tutucu: içerik gelince düzen zıplamıyor.
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-28 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800"
        />
      ))}
    </div>
  );
}
