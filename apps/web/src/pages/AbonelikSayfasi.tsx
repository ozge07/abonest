import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AbonelikFormu } from '../components/AbonelikFormu';
import { Dugme } from '../components/form';
import { MarkaKarosu } from '../components/MarkaKarosu';
import { api } from '../lib/api';
import { donguYaz, gunSayisiYaz, paraYaz, tarihYaz } from '../lib/money';
import type { Abonelik, Sayfa } from '../lib/types';

/**
 * Abonelik listesi.
 *
 * ## Düzenin mantığı
 *
 * Kullanıcının bu ekranda sorduğu soru "neyim var" değil, **"sırada ne var ve
 * bana kaça mal oluyor"**. Sıralama ve hiyerarşi buna göre:
 *
 * - Aktifler **sonraki ödeme tarihine** göre sıralı; en yakın ödeme en üstte.
 * - Pasifler (duraklatılmış, iptal, süresi dolmuş) en altta ve soluk.
 * - Fiyat sağda, hizalı rakamlarla: göz aşağı doğru tarayıp karşılaştırıyor.
 * - Yakın ödeme rengiyle öne çıkıyor; uzak olan sessiz kalıyor.
 *
 * Ayrı kartlar yerine tek bir bölünmüş liste: sekiz ayrı çerçeve göz yoruyor
 * ve hiçbir şeyi ayırt etmiyordu.
 */
export function AbonelikSayfasi() {
  const [formAcik, setFormAcik] = useState(false);
  const queryClient = useQueryClient();

  const sorgu = useQuery({
    queryKey: ['subscriptions'],
    queryFn: () => api.get<Sayfa<Abonelik>>('/subscriptions?limit=100'),
  });

  const durumDegistir = useMutation({
    mutationFn: ({ id, eylem }: { id: string; eylem: string }) =>
      api.post<Abonelik>(`/subscriptions/${id}/${eylem}`),
    onSuccess: async () => {
      // Özet ve analiz de değişiyor: iptal edilen abonelik toplamdan düşmeli.
      await queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
  });

  const abonelikler = sirala(sorgu.data?.data ?? []);
  const aktifler = abonelikler.filter((a) => a.status === 'ACTIVE');
  const pasifler = abonelikler.filter((a) => a.status !== 'ACTIVE');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Abonelikler</h1>
          {aktifler.length > 0 && <OzetSatiri abonelikler={aktifler} />}
        </div>
        {!formAcik && (
          <Dugme onClick={() => setFormAcik(true)}>Yeni abonelik</Dugme>
        )}
      </div>

      {formAcik && (
        <AbonelikFormu
          onKapat={() => setFormAcik(false)}
          onKaydedildi={() => setFormAcik(false)}
        />
      )}

      {sorgu.isPending && <Iskelet />}

      {!sorgu.isPending && abonelikler.length === 0 && !formAcik && (
        <BosDurum onEkle={() => setFormAcik(true)} />
      )}

      {aktifler.length > 0 && (
        <Liste
          abonelikler={aktifler}
          onEylem={(id, eylem) => durumDegistir.mutate({ id, eylem })}
        />
      )}

      {pasifler.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
            Artık ödenmeyenler
          </h2>
          <Liste
            abonelikler={pasifler}
            soluk
            onEylem={(id, eylem) => durumDegistir.mutate({ id, eylem })}
          />
        </section>
      )}
    </div>
  );
}

/** Aktifler ödeme sırasına, ödemesi olmayanlar adına göre. */
function sirala(abonelikler: Abonelik[]): Abonelik[] {
  return [...abonelikler].sort((a, b) => {
    if (a.nextPaymentDate !== null && b.nextPaymentDate !== null) {
      return a.nextPaymentDate.localeCompare(b.nextPaymentDate);
    }
    if (a.nextPaymentDate !== null) return -1;
    if (b.nextPaymentDate !== null) return 1;
    return a.name.localeCompare(b.name, 'tr');
  });
}

function OzetSatiri({ abonelikler }: { abonelikler: Abonelik[] }) {
  // Para birimleri toplanmıyor; her biri kendi toplamını taşıyor.
  const toplamlar = new Map<string, number>();
  for (const abonelik of abonelikler) {
    toplamlar.set(
      abonelik.currency,
      (toplamlar.get(abonelik.currency) ?? 0) + abonelik.monthlyEquivalentMinor,
    );
  }

  return (
    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
      {abonelikler.length} aktif abonelik ·{' '}
      <span className="tabular-nums">
        {[...toplamlar]
          .map(([birim, tutar]) => paraYaz(tutar, birim))
          .join(' + ')}
      </span>{' '}
      / ay
    </p>
  );
}

function Liste({
  abonelikler,
  soluk = false,
  onEylem,
}: {
  abonelikler: Abonelik[];
  soluk?: boolean;
  onEylem: (id: string, eylem: string) => void;
}) {
  return (
    <ul
      className={[
        'divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900',
        soluk ? 'opacity-70' : '',
      ].join(' ')}
    >
      {abonelikler.map((abonelik) => (
        <Satir key={abonelik.id} abonelik={abonelik} onEylem={onEylem} />
      ))}
    </ul>
  );
}

function Satir({
  abonelik,
  onEylem,
}: {
  abonelik: Abonelik;
  onEylem: (id: string, eylem: string) => void;
}) {
  return (
    <li className="group flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
      <MarkaKarosu
        ad={abonelik.name}
        renk={abonelik.provider?.color}
        logo={abonelik.provider?.logoUrl}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{abonelik.name}</span>
          <DurumRozeti durum={abonelik.status} />
        </div>
        <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">
          {abonelik.category.name} ·{' '}
          {donguYaz(abonelik.billingCycle, abonelik.customIntervalDays)}
        </p>
      </div>

      {/*
        * Dar ekranda ödeme ve fiyat, ad satırının altına birlikte iniyor:
        * sabit genişlikte iki sütun 430 px'de adı ezerdi. Geniş ekranda
        * hizalı sütunlar kalıyor, çünkü göz aşağı doğru tarayıp
        * karşılaştırıyor.
        */}
      <div className="flex w-full items-center justify-between gap-4 sm:w-auto sm:justify-end">
        <SonrakiOdeme tarih={abonelik.nextPaymentDate} />

        <div className="text-right sm:w-32">
        <p className="font-semibold tabular-nums">
          {paraYaz(abonelik.priceMinor, abonelik.currency)}
        </p>
        {abonelik.billingCycle !== 'MONTHLY' && (
          // Aylık karşılık, farklı döngüleri karşılaştırılabilir kılan tek
          // sayı: yıllık 1.299 TL ile aylık 89 TL'yi kafadan kıyaslamak zor.
          <p className="text-xs text-slate-500 dark:text-slate-400">
            ayda {paraYaz(abonelik.monthlyEquivalentMinor, abonelik.currency)}
          </p>
        )}
        </div>
      </div>

      {/*
        * Eylemler sakin duruyor, satırın üzerine gelince belirginleşiyor.
        * Her satırda iki parlak düğme listeyi okunmaz hâle getiriyordu.
        * Klavye ve dokunmatik için her zaman erişilebilirler — değişen tek
        * şey renk, görünürlük değil.
        */}
      <div className="flex w-full justify-end gap-1 sm:w-auto">
        {abonelik.status === 'ACTIVE' && (
          <>
            <Eylem onClick={() => onEylem(abonelik.id, 'pause')}>
              Duraklat
            </Eylem>
            <Eylem onClick={() => onEylem(abonelik.id, 'cancel')}>İptal</Eylem>
          </>
        )}
        {(abonelik.status === 'PAUSED' || abonelik.status === 'CANCELLED') && (
          <Eylem onClick={() => onEylem(abonelik.id, 'resume')}>
            Devam ettir
          </Eylem>
        )}
      </div>
    </li>
  );
}

/**
 * Sonraki ödeme — listedeki en karar verdirici bilgi.
 *
 * Üç gün ve altı vurgulu: kullanıcı iptal edecekse son şansı orada.
 */
function SonrakiOdeme({ tarih }: { tarih: string | null }) {
  if (tarih === null) {
    return (
      <div className="text-sm text-slate-400 sm:w-36 dark:text-slate-500">
        ödeme yok
      </div>
    );
  }

  const gun = gunFarki(tarih);
  const yakin = gun <= 3;

  return (
    <div className="sm:w-36">
      <p
        className={[
          'text-sm font-medium',
          yakin
            ? 'text-amber-700 dark:text-amber-400'
            : 'text-slate-700 dark:text-slate-300',
        ].join(' ')}
      >
        {gunSayisiYaz(gun)}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {tarihYaz(tarih)}
      </p>
    </div>
  );
}

function DurumRozeti({ durum }: { durum: Abonelik['status'] }) {
  if (durum === 'ACTIVE') {
    return null;
  }

  const metin = {
    PAUSED: 'duraklatıldı',
    CANCELLED: 'iptal edildi',
    EXPIRED: 'süresi doldu',
  }[durum];

  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      {metin}
    </span>
  );
}

function Eylem({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-marka-500/40 focus-visible:outline-none group-hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100 dark:group-hover:text-slate-300"
    >
      {children}
    </button>
  );
}

function BosDurum({ onEkle }: { onEkle: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
      <h2 className="text-base font-semibold">İlk aboneliğini ekle</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600 dark:text-slate-400">
        Netflix, spor salonu, internet — ne ödüyorsan ekle. Ayda ne kadar
        gittiğini ve sırada hangi ödemenin olduğunu buradan takip edeceksin.
      </p>
      <div className="mt-5">
        <Dugme onClick={onEkle}>Abonelik ekle</Dugme>
      </div>
    </div>
  );
}

function Iskelet() {
  // Boş ekran yerine yer tutucu: içerik gelince düzen zıplamıyor.
  return (
    <div
      className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800"
      aria-hidden
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <div className="h-11 w-11 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-3 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Bugünden verilen ISO gününe kaç gün var. */
function gunFarki(iso: string): number {
  const bugun = new Date();
  const bugunUtc = Date.UTC(
    bugun.getFullYear(),
    bugun.getMonth(),
    bugun.getDate(),
  );
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - bugunUtc) / 86_400_000);
}
