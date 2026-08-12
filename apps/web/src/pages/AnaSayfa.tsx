import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router';
import { HalkaGrafik, type HalkaDilimi } from '../components/HalkaGrafik';
import { MarkaKarosu } from '../components/MarkaKarosu';
import { api } from '../lib/api';
import { tryKarsiligi, useKurlar, type Kurlar } from '../lib/kur';
import { gunSayisiYaz, paraYaz, tarihYaz } from '../lib/money';
import type { Ozet } from '../lib/types';

/**
 * Ana ekran — üç soruyu cevaplıyor: **ne kadar gidiyor, sırada ne var, nereye
 * gidiyor.**
 *
 * ## Düzen
 *
 * Üstte tek bir büyük sayı: aylık toplam. Kullanıcı uygulamayı çoğunlukla o
 * sayıyı görmek için açıyor, aşağı kaydırmak zorunda kalmamalı.
 *
 * Altında iki sütun — solda sıradaki ödemeler, sağda kategori dağılımı.
 * Geniş ekranda yan yana duruyorlar; alt alta koymak ekranın sağ yarısını
 * boş bırakıyordu.
 *
 * Tek API çağrısı. Beş ayrı istek atmak yavaş ağda ekranın parça parça
 * dolmasına ve düzenin zıplamasına yol açardı.
 */
export function AnaSayfa() {
  const sorgu = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<Ozet>('/dashboard'),
  });
  const kurlar = useKurlar();

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
   * kullanıcının yapması gereken tek şey ilk aboneliğini eklemek.
   */
  if (ozet.activeCount === 0) {
    return <Navigate to="/abonelikler" replace />;
  }

  return (
    <div className="flex flex-col gap-6">
      <ToplamKarti ozet={ozet} kurlar={kurlar.data} />

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <BolumBasligi>Sırada ne var</BolumBasligi>
          <YaklasanOdemeler odemeler={ozet.upcoming} kurlar={kurlar.data} />
        </section>

        <section className="lg:col-span-2">
          <BolumBasligi>Nereye gidiyor</BolumBasligi>
          <KategoriDagilimi ozet={ozet} kurlar={kurlar.data} />
        </section>
      </div>

      {ozet.cancelledThisMonth > 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Bu ay {ozet.cancelledThisMonth} aboneliği iptal ettin.
        </p>
      )}
    </div>
  );
}

/**
 * Aylık toplam — ekranın tepesindeki tek büyük sayı.
 *
 * Yabancı para varsa TL karşılığı da veriliyor; kullanıcı bütçesini tek bir
 * sayıyla düşünüyor. Kurun tarihi yazılı, çünkü bu bir çeviri — kesin bir
 * tutar değil. Kur bilinmiyorsa çeviri hiç yapılmıyor ve para birimleri
 * ayrı kalıyor (ADR-0007).
 */
function ToplamKarti({
  ozet,
  kurlar,
}: {
  ozet: Ozet;
  kurlar: Kurlar | undefined;
}) {
  const hepsiCevrilebilir = ozet.totals.every(
    (satir) =>
      satir.currency === 'TRY' ||
      tryKarsiligi(1, satir.currency, kurlar) !== null,
  );

  const aylik = ozet.totals.reduce((toplam, satir) => {
    if (satir.currency === 'TRY') return toplam + satir.monthlyMinor;
    return toplam + (tryKarsiligi(satir.monthlyMinor, satir.currency, kurlar) ?? 0);
  }, 0);

  const yillik = ozet.totals.reduce((toplam, satir) => {
    if (satir.currency === 'TRY') return toplam + satir.yearlyMinor;
    return toplam + (tryKarsiligi(satir.yearlyMinor, satir.currency, kurlar) ?? 0);
  }, 0);

  const cokParaBirimi = ozet.totals.length > 1;

  return (
    <section className="rounded-2xl bg-gradient-to-br from-marka-600 to-marka-700 p-6 text-white shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <p className="text-sm text-white/70">Aylık gideri</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">
            {hepsiCevrilebilir
              ? paraYaz(aylik, 'TRY')
              : ozet.totals
                  .map((t) => paraYaz(t.monthlyMinor, t.currency))
                  .join(' + ')}
          </p>

          {cokParaBirimi && hepsiCevrilebilir && (
            <p className="mt-1.5 text-sm text-white/70">
              {ozet.totals
                .map((t) => paraYaz(t.monthlyMinor, t.currency))
                .join(' + ')}
              {kurlar?.date != null &&
                ` · ${tarihYaz(kurlar.date)} TCMB kuru`}
            </p>
          )}
        </div>

        <div className="flex gap-6">
          {hepsiCevrilebilir && (
            <Rakam etiket="yılda" deger={paraYaz(yillik, 'TRY')} />
          )}
          <Rakam etiket="abonelik" deger={String(ozet.activeCount)} />
        </div>
      </div>
    </section>
  );
}

function Rakam({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div className="text-right">
      <p className="text-xs tracking-wide text-white/60 uppercase">{etiket}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{deger}</p>
    </div>
  );
}

function YaklasanOdemeler({
  odemeler,
  kurlar,
}: {
  odemeler: Ozet['upcoming'];
  kurlar: Kurlar | undefined;
}) {
  if (odemeler.length === 0) {
    return (
      <Kart>
        <p className="p-4 text-sm text-slate-500 dark:text-slate-400">
          Önümüzdeki 30 günde ödeme görünmüyor.
        </p>
      </Kart>
    );
  }

  return (
    <Kart>
      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {odemeler.map((odeme) => {
          // Üç gün ve altı: kullanıcı iptal edecekse son şansı burada.
          const cokYakin = odeme.daysUntil <= 3;
          const karsilik = tryKarsiligi(
            odeme.amountMinor,
            odeme.currency,
            kurlar,
          );

          return (
            <li
              key={`${odeme.subscriptionId}-${odeme.dueDate}`}
              className={[
                'flex items-center gap-3 px-4 py-3 transition-colors',
                cokYakin ? 'bg-amber-50/60 dark:bg-amber-500/5' : '',
              ].join(' ')}
            >
              <MarkaKarosu
                ad={odeme.name}
                renk={odeme.color}
                logo={odeme.logoUrl}
                nabiz={cokYakin}
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{odeme.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {tarihYaz(odeme.dueDate)}
                </p>
              </div>

              <span
                className={[
                  'rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
                  cokYakin
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                ].join(' ')}
              >
                {gunSayisiYaz(odeme.daysUntil)}
              </span>

              <div className="w-24 text-right">
                <p className="text-sm font-medium tabular-nums">
                  {paraYaz(odeme.amountMinor, odeme.currency)}
                </p>
                {karsilik !== null && (
                  <p className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
                    ≈ {paraYaz(karsilik, 'TRY')}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Kart>
  );
}

interface DagilimSatiri {
  categoryId: string;
  name: string;
  color: string | null;
  tutar: number;
  currency: string;
  pay: number;
}

/**
 * Kategori dağılımı — halka grafik ve liste.
 *
 * ## Bütün kategoriler tek halkada
 *
 * Önce grafik yalnızca **tek** para birimini çiziyordu: dolarla ödenen
 * abonelikleri olan bir kullanıcı halkada sadece TL'lileri görüyordu.
 * Üstelik "ana birim" ham sayıları karşılaştırarak seçiliyordu — 52.800 cent
 * ile 120.000 kuruşu kıyaslamak anlamsız.
 *
 * Artık TCMB kuru elimizde olduğu için hepsi TL'ye çevrilip birleştiriliyor;
 * aynı kategori farklı para birimlerinde de olsa tek dilim oluyor. Kur
 * bilinmiyorsa eski davranışa dönülüyor — uydurma bir oran göstermektense
 * eksik göstermek doğru.
 */
function KategoriDagilimi({
  ozet,
  kurlar,
}: {
  ozet: Ozet;
  kurlar: Kurlar | undefined;
}) {
  const hepsiCevrilebilir = ozet.byCategory.every(
    (k) => k.currency === 'TRY' || tryKarsiligi(1, k.currency, kurlar) !== null,
  );

  const satirlar = hepsiCevrilebilir
    ? tlyeBirlestir(ozet.byCategory, kurlar)
    : tekBirim(ozet);

  if (satirlar.length === 0) {
    return null;
  }

  const toplam = satirlar.reduce((t, k) => t + k.tutar, 0);
  const paraBirimi = satirlar[0]!.currency;

  return (
    <Kart>
      <div className="flex flex-col items-center gap-5 p-4">
        <HalkaGrafik
          dilimler={satirlar.map(
            (kategori, sira): HalkaDilimi => ({
              anahtar: kategori.categoryId,
              etiket: kategori.name,
              deger: kategori.tutar,
              renk: kategori.color ?? YEDEK_RENKLER[sira % YEDEK_RENKLER.length]!,
            }),
          )}
          ortaUst={paraYaz(toplam, paraBirimi)}
          ortaAlt="aylık"
        />

        <ul className="w-full space-y-2">
          {satirlar.map((kategori, sira) => (
            <li
              key={kategori.categoryId}
              className="flex items-center gap-2.5 text-sm"
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor:
                    kategori.color ?? YEDEK_RENKLER[sira % YEDEK_RENKLER.length],
                }}
              />
              <span className="min-w-0 flex-1 truncate">{kategori.name}</span>
              <span className="tabular-nums">
                {paraYaz(kategori.tutar, kategori.currency)}
              </span>
              <span className="w-10 text-right text-xs text-slate-500 tabular-nums dark:text-slate-400">
                %{Math.round(kategori.pay * 100)}
              </span>
            </li>
          ))}
        </ul>

        {hepsiCevrilebilir && kurlar?.date != null && ozet.totals.length > 1 && (
          <p className="w-full text-xs text-slate-500 dark:text-slate-400">
            Yabancı para birimleri {tarihYaz(kurlar.date)} TCMB kuruyla
            TL'ye çevrildi.
          </p>
        )}
      </div>
    </Kart>
  );
}

/**
 * Bütün kategorileri TL'ye çevirip aynı kategorileri birleştiriyor.
 *
 * "Yazılım ve Araçlar" hem dolarla hem lirayla ödeniyorsa tek dilim olmalı;
 * ayrı göstermek aynı kategoriyi iki kez listeler ve pay hesabını bozar.
 */
function tlyeBirlestir(
  kategoriler: Ozet['byCategory'],
  kurlar: Kurlar | undefined,
): DagilimSatiri[] {
  const birlesik = new Map<string, DagilimSatiri>();

  for (const kategori of kategoriler) {
    const tutar =
      kategori.currency === 'TRY'
        ? kategori.monthlyMinor
        : (tryKarsiligi(kategori.monthlyMinor, kategori.currency, kurlar) ?? 0);

    const mevcut = birlesik.get(kategori.categoryId);
    if (mevcut === undefined) {
      birlesik.set(kategori.categoryId, {
        categoryId: kategori.categoryId,
        name: kategori.name,
        color: kategori.color,
        tutar,
        currency: 'TRY',
        pay: 0,
      });
    } else {
      mevcut.tutar += tutar;
    }
  }

  const satirlar = [...birlesik.values()].sort((a, b) => b.tutar - a.tutar);
  const toplam = satirlar.reduce((t, k) => t + k.tutar, 0);

  for (const satir of satirlar) {
    satir.pay = toplam === 0 ? 0 : satir.tutar / toplam;
  }
  return satirlar;
}

/** Kur yoksa eski davranış: en çok aboneliği olan para birimi. */
function tekBirim(ozet: Ozet): DagilimSatiri[] {
  const sayim = new Map<string, number>();
  for (const kategori of ozet.byCategory) {
    sayim.set(kategori.currency, (sayim.get(kategori.currency) ?? 0) + 1);
  }
  const anaBirim =
    [...sayim.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'TRY';

  return ozet.byCategory
    .filter((k) => k.currency === anaBirim)
    .map((kategori) => ({
      categoryId: kategori.categoryId,
      name: kategori.name,
      color: kategori.color,
      tutar: kategori.monthlyMinor,
      currency: kategori.currency,
      pay: kategori.share,
    }));
}

/** Kategorinin kendi rengi yoksa kullanılacak sıra. */
const YEDEK_RENKLER = [
  '#2563EB',
  '#16A34A',
  '#E11D48',
  '#CA8A04',
  '#7C3AED',
  '#0891B2',
  '#EA580C',
  '#57534E',
];

function BolumBasligi({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
      {children}
    </h2>
  );
}

function Kart({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {children}
    </div>
  );
}

function Iskelet() {
  // Boş ekran yerine yer tutucu: içerik gelince düzen zıplamıyor.
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="h-32 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="h-64 animate-pulse rounded-xl bg-slate-200 lg:col-span-3 dark:bg-slate-800" />
        <div className="h-64 animate-pulse rounded-xl bg-slate-200 lg:col-span-2 dark:bg-slate-800" />
      </div>
    </div>
  );
}
