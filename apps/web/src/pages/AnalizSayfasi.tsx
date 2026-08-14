import { SayfaBasligi } from '../components/SayfaBasligi';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { paraYaz } from '../lib/money';
import type { Harcama, HarcamaKovasi, KullanilmayanAbonelik } from '../lib/types';

const ARALIKLAR = [
  { deger: 6, ad: 'Son 6 ay' },
  { deger: 12, ad: 'Son 12 ay' },
  { deger: 24, ad: 'Son 2 yıl' },
] as const;

export function AnalizSayfasi() {
  const [ayAdedi, setAyAdedi] = useState<number>(12);
  const [gruplama, setGruplama] = useState<'month' | 'category'>('month');

  const { from, to } = aralik(ayAdedi);

  const harcama = useQuery({
    queryKey: ['analytics', 'spending', from, to, gruplama],
    queryFn: () =>
      api.get<Harcama>(
        `/analytics/spending?from=${from}&to=${to}&groupBy=${gruplama}`,
      ),
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SayfaBasligi baslik="Harcama analizi" />

        <div className="flex gap-2">
          <SecimDugmeleri
            secili={String(ayAdedi)}
            secenekler={ARALIKLAR.map((a) => ({
              deger: String(a.deger),
              ad: a.ad,
            }))}
            onSec={(d) => setAyAdedi(Number(d))}
          />
          <SecimDugmeleri
            secili={gruplama}
            secenekler={[
              { deger: 'month', ad: 'Aya göre' },
              { deger: 'category', ad: 'Kategoriye göre' },
            ]}
            onSec={(d) => setGruplama(d as 'month' | 'category')}
          />
        </div>
      </div>

      {harcama.isPending && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Yükleniyor…</p>
      )}

      {harcama.data !== undefined && (
        <>
          <ToplamKartlari toplamlar={harcama.data.totals} ayAdedi={ayAdedi} />
          <HarcamaGrafigi
            kovalar={harcama.data.buckets}
            gruplama={harcama.data.groupBy}
          />
        </>
      )}

      <KullanilmayanlarBolumu />

      {/*
       * Sınırı gizlemiyoruz. Geçmiş fiyat hiçbir yerde saklanmıyor; kayıt
       * bulunmayan dönemler bugünkü fiyatla hesaplanıyor. Kullanıcı sayının
       * nereden geldiğini bilmeden ona güvenmemeli.
       */}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Geçmiş harcama, aboneliğin ödeme döngüsünden hesaplanıyor. Fiyatı
        sonradan değişen abonelikler için eski dönemler bugünkü fiyatla
        gösteriliyor.
      </p>
    </div>
  );
}

function ToplamKartlari({
  toplamlar,
  ayAdedi,
}: {
  toplamlar: Harcama['totals'];
  ayAdedi: number;
}) {
  if (toplamlar.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
        Bu aralıkta harcama görünmüyor.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {toplamlar.map((toplam) => (
        <div
          key={toplam.currency}
          className="cam rounded-xl p-4"
        >
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {toplam.currency} · toplam
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {paraYaz(toplam.totalMinor, toplam.currency)}
          </p>
          {/*
            * "Ayda ortalama" ile ana ekrandaki "aylık gider" farklı şeyler:
            * buradaki, seçili aralığın tamamına yayılmış ortalama ve abonelik
            * olmayan aylar da paydaya giriyor. Etiket bunu söylemezse
            * kullanıcı iki sayıyı karşılaştırıp birinin yanlış olduğunu
            * sanıyor.
            */}
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {ayAdedi} aya bölününce ayda{' '}
            {paraYaz(Math.round(toplam.totalMinor / ayAdedi), toplam.currency)}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * Basit çubuk grafik.
 *
 * Grafik kütüphanesi eklemiyoruz: tek bir çubuk listesi için 50 kB JavaScript
 * indirmenin karşılığı yok ve bu görünüm CSS ile birebir aynı sonucu veriyor.
 */
function HarcamaGrafigi({
  kovalar,
  gruplama,
}: {
  kovalar: HarcamaKovasi[];
  gruplama: 'month' | 'category';
}) {
  if (kovalar.length === 0) {
    return null;
  }

  // Ölçek para birimi başına: farklı para birimlerini aynı eksene koymak
  // 20 dolarlık aboneliği 750 liralıktan büyük gösterirdi.
  const paraBirimleri = [...new Set(kovalar.map((k) => k.currency))];

  return (
    <div className="flex flex-col gap-5">
      {paraBirimleri.map((currency) => {
        const kendi = kovalar.filter((k) => k.currency === currency);
        const enBuyuk = Math.max(...kendi.map((k) => k.totalMinor));

        return (
          <section key={currency}>
            {paraBirimleri.length > 1 && (
              <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                {currency}
              </p>
            )}
            <div className="cam rounded-xl p-4">
              <ul className="flex flex-col gap-2.5">
                {kendi.map((kova) => (
                  <li
                    key={kova.period ?? kova.categoryId}
                    className="grid grid-cols-[7rem_1fr_auto] items-center gap-3"
                  >
                    <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {gruplama === 'month'
                        ? ayAdiYaz(kova.period ?? '')
                        : kova.name}
                    </span>
                    <span
                      className="h-5 overflow-hidden rounded bg-slate-100 dark:bg-slate-800"
                      role="presentation"
                    >
                      <span
                        className="block h-full rounded bg-marka-500"
                        style={{
                          width: `${Math.max((kova.totalMinor / enBuyuk) * 100, 1.5)}%`,
                        }}
                      />
                    </span>
                    <span className="text-sm tabular-nums">
                      {paraYaz(kova.totalMinor, kova.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function KullanilmayanlarBolumu() {
  const queryClient = useQueryClient();
  const [esik, setEsik] = useState(30);

  const liste = useQuery({
    queryKey: ['analytics', 'unused', esik],
    queryFn: () =>
      api.get<KullanilmayanAbonelik[]>(`/analytics/unused?thresholdDays=${esik}`),
  });

  const kullandim = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/subscriptions/${id}`, {
        lastUsedAt: new Date().toISOString().slice(0, 10),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['analytics'] });
      await queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });

  const abonelikler = liste.data ?? [];

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-500 uppercase dark:text-slate-400">
          Kullanmıyor olabilirsin
        </h2>
        <SecimDugmeleri
          secili={String(esik)}
          secenekler={[
            { deger: '30', ad: '30 gün' },
            { deger: '60', ad: '60 gün' },
            { deger: '90', ad: '90 gün' },
          ]}
          onSec={(d) => setEsik(Number(d))}
        />
      </div>

      {abonelikler.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
          {liste.isPending
            ? 'Yükleniyor…'
            : `Son ${esik} günde dokunulmamış abonelik yok.`}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {abonelikler.map((abonelik) => (
            <li
              key={abonelik.id}
              className="flex flex-wrap items-center gap-4 cam rounded-xl p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{abonelik.name}</p>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {abonelik.lastUsedAt === null
                    ? `Hiç kullandım işaretlenmedi · ${abonelik.idleDays} gündür kayıtlı`
                    : `${abonelik.idleDays} gündür kullanılmadı`}
                </p>
              </div>

              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  yılda {paraYaz(abonelik.wastedPerYearMinor, abonelik.currency)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {abonelik.category.name}
                </p>
              </div>

              <button
                type="button"
                onClick={() => kullandim.mutate(abonelik.id)}
                disabled={kullandim.isPending}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Kullanıyorum
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SecimDugmeleri({
  secili,
  secenekler,
  onSec,
}: {
  secili: string;
  secenekler: { deger: string; ad: string }[];
  onSec: (deger: string) => void;
}) {
  return (
    <div
      role="group"
      className="inline-flex overflow-hidden rounded-md border border-slate-300 dark:border-slate-700"
    >
      {secenekler.map((secenek) => (
        <button
          key={secenek.deger}
          type="button"
          onClick={() => onSec(secenek.deger)}
          aria-pressed={secili === secenek.deger}
          className={[
            'px-3 py-1.5 text-xs font-medium transition-colors',
            secili === secenek.deger
              ? 'bg-marka-600 text-marka-yazi'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800',
          ].join(' ')}
        >
          {secenek.ad}
        </button>
      ))}
    </div>
  );
}

/** Bugünden geriye `ayAdedi` aylık aralık. */
function aralik(ayAdedi: number): { from: string; to: string } {
  const bugun = new Date();
  const bitis = new Date(
    Date.UTC(bugun.getUTCFullYear(), bugun.getUTCMonth() + 1, 0),
  );
  const baslangic = new Date(
    Date.UTC(bugun.getUTCFullYear(), bugun.getUTCMonth() - ayAdedi + 1, 1),
  );

  return {
    from: baslangic.toISOString().slice(0, 10),
    to: bitis.toISOString().slice(0, 10),
  };
}

const AYLAR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

function ayAdiYaz(period: string): string {
  const [yil, ay] = period.split('-');
  const ad = AYLAR[Number(ay) - 1] ?? period;
  return `${ad} ${yil}`;
}
