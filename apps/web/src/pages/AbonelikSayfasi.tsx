import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AbonelikFormu } from '../components/AbonelikFormu';
import { Dugme } from '../components/form';
import { MarkaKarosu } from '../components/MarkaKarosu';
import { OnayKutusu } from '../components/OnayKutusu';
import { api } from '../lib/api';
import { tryKarsiligi, useKurlar, type Kurlar } from '../lib/kur';
import {
  donguYaz,
  gunSayisiYaz,
  paraYaz,
  tarihKisaYaz,
  tarihYaz,
} from '../lib/money';
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
  /** Silinmesi onaylanacak abonelik; kutu bununla açılıyor. */
  const [silinecek, setSilinecek] = useState<Abonelik | null>(null);
  const queryClient = useQueryClient();

  const sorgu = useQuery({
    queryKey: ['subscriptions'],
    queryFn: () => api.get<Sayfa<Abonelik>>('/subscriptions?limit=100'),
  });

  const kurlar = useKurlar();

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

  const sil = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/subscriptions/${id}`),
    onSuccess: async () => {
      setSilinecek(null);
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
          {aktifler.length > 0 && (
            <OzetSatiri abonelikler={aktifler} kurlar={kurlar.data} />
          )}
        </div>
        {!formAcik && (
          <Dugme onClick={() => setFormAcik(true)}>
            <span className="flex items-center gap-1.5">
              <ArtiSimgesi />
              Yeni abonelik
            </span>
          </Dugme>
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
          kurlar={kurlar.data}
          onEylem={(id, eylem) => durumDegistir.mutate({ id, eylem })}
          onSil={setSilinecek}
        />
      )}

      {pasifler.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
            Artık ödenmeyenler
          </h2>
          <Liste
            abonelikler={pasifler}
            kurlar={kurlar.data}
            soluk
            onEylem={(id, eylem) => durumDegistir.mutate({ id, eylem })}
            onSil={setSilinecek}
          />
        </section>
      )}
      {silinecek !== null && (
        <OnayKutusu
          baslik={`${silinecek.name} silinsin mi?`}
          aciklama="Bu abonelik ve geçmiş ödeme kayıtları kalıcı olarak siliniyor; geri alınamaz. Yalnızca ödemeyi durdurmak istiyorsan 'İptal' daha doğru — geçmişin korunuyor."
          bekliyor={sil.isPending}
          onOnayla={() => sil.mutate(silinecek.id)}
          onVazgec={() => setSilinecek(null)}
        />
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

function OzetSatiri({
  abonelikler,
  kurlar,
}: {
  abonelikler: Abonelik[];
  kurlar: Kurlar | undefined;
}) {
  // Para birimleri toplanmıyor; her biri kendi toplamını taşıyor.
  const toplamlar = new Map<string, number>();
  for (const abonelik of abonelikler) {
    toplamlar.set(
      abonelik.currency,
      (toplamlar.get(abonelik.currency) ?? 0) + abonelik.monthlyEquivalentMinor,
    );
  }

  /*
   * Yabancı paralar TL'ye çevrilip **tek bir aylık toplam** da veriliyor.
   *
   * ADR-0007 toplamların para birimi başına ayrı kalmasını söylüyor ve o
   * karar duruyor: her para birimi kendi satırında. Buradaki ek satır
   * uydurma bir kurla değil TCMB'nin günlük kuruyla hesaplanıyor ve
   * "yaklaşık" olduğu, hangi güne ait olduğu yazıyor.
   */
  const tumuTry = [...toplamlar].every(([birim]) => birim === 'TRY');
  const tryToplam = [...toplamlar].reduce((toplam, [birim, tutar]) => {
    if (birim === 'TRY') return toplam + tutar;
    const cevrilmis = tryKarsiligi(tutar, birim, kurlar);
    return cevrilmis === null ? toplam : toplam + cevrilmis;
  }, 0);

  const cevrilebilir =
    !tumuTry &&
    [...toplamlar].every(
      ([birim]) => birim === 'TRY' || tryKarsiligi(1, birim, kurlar) !== null,
    );

  return (
    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
      {abonelikler.length} aktif abonelik ·{' '}
      <span className="tabular-nums">
        {[...toplamlar]
          .map(([birim, tutar]) => paraYaz(tutar, birim))
          .join(' + ')}
      </span>{' '}
      / ay
      {cevrilebilir && (
        <span
          className="tabular-nums"
          title={
            kurlar?.date != null
              ? `${kurlar.date} tarihli TCMB kuruyla`
              : undefined
          }
        >
          {' '}
          · yaklaşık {paraYaz(tryToplam, 'TRY')}
        </span>
      )}
    </p>
  );
}

function Liste({
  abonelikler,
  kurlar,
  soluk = false,
  onEylem,
  onSil,
}: {
  abonelikler: Abonelik[];
  kurlar: Kurlar | undefined;
  soluk?: boolean;
  onEylem: (id: string, eylem: string) => void;
  onSil: (abonelik: Abonelik) => void;
}) {
  return (
    <ul
      className={[
        'divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white/80 backdrop-blur-xl dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900/70',
        soluk ? 'opacity-70' : '',
      ].join(' ')}
    >
      {abonelikler.map((abonelik) => (
        <Satir
          key={abonelik.id}
          abonelik={abonelik}
          kurlar={kurlar}
          onEylem={onEylem}
          onSil={onSil}
        />
      ))}
    </ul>
  );
}

function Satir({
  abonelik,
  kurlar,
  onEylem,
  onSil,
}: {
  abonelik: Abonelik;
  kurlar: Kurlar | undefined;
  onEylem: (id: string, eylem: string) => void;
  onSil: (abonelik: Abonelik) => void;
}) {
  const kalanGun =
    abonelik.nextPaymentDate === null
      ? null
      : gunFarki(abonelik.nextPaymentDate);
  // Üç gün ve altı: kullanıcı iptal edecekse son şansı burada.
  const cokYakin =
    abonelik.status === 'ACTIVE' && kalanGun !== null && kalanGun <= 3;

  return (
    <li
      className={[
        'group relative flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 transition-colors',
        'hover:bg-slate-50 dark:hover:bg-slate-800/40',
        cokYakin ? 'bg-amber-50/60 dark:bg-amber-500/5' : '',
      ].join(' ')}
    >
      <MarkaKarosu
        ad={abonelik.name}
        renk={abonelik.provider?.color}
        logo={abonelik.provider?.logoUrl}
        nabiz={cokYakin}
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
          <OdemeDurumu abonelik={abonelik} />

          <div className="text-right sm:w-36">
          <p className="font-semibold tabular-nums">
            {paraYaz(abonelik.priceMinor, abonelik.currency)}
          </p>

          {/*
            * Yabancı paranın TL karşılığı.
            *
            * Tutar kendi para biriminde kalıyor — kullanıcı 24 doları
            * ödüyor, 1.146 lirayı değil. TL karşılığı yanında, **yaklaşık**
            * işaretiyle: kur her gün değişiyor ve kartın kestiği kur
            * bankanınkinden farklı olabiliyor.
            */}
          <TryKarsiligi
            minor={abonelik.priceMinor}
            currency={abonelik.currency}
            kurlar={kurlar}
          />

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
        <Eylem tehlikeli onClick={() => onSil(abonelik)}>
          Sil
        </Eylem>
      </div>
    </li>
  );
}

function TryKarsiligi({
  minor,
  currency,
  kurlar,
}: {
  minor: number;
  currency: string;
  kurlar: Kurlar | undefined;
}) {
  const karsilik = tryKarsiligi(minor, currency, kurlar);
  if (karsilik === null) {
    // Kur bilinmiyorsa hiçbir şey gösterilmiyor: yanlış bir TL karşılığı,
    // hiç göstermemekten kötü.
    return null;
  }

  return (
    <p
      className="text-xs text-slate-500 tabular-nums dark:text-slate-400"
      title={
        kurlar?.date != null
          ? `${kurlar.date} tarihli TCMB kuruyla`
          : undefined
      }
    >
      ≈ {paraYaz(karsilik, 'TRY')}
    </p>
  );
}

function ArtiSimgesi() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/**
 * Ödeme durumu — listedeki en karar verdirici bilgi.
 *
 * İki tarih birden gösteriliyor:
 *
 * - **Sonraki ödeme**, üç gün ve altındaysa vurgulu (iptal edecekse son şans).
 * - **Yeni geçmiş ödeme**, varsa altında soluk bir satır olarak.
 *
 * İkincisi bir kullanıcı şikâyetinden doğdu: 11 Temmuz'da başlayan aylık bir
 * abonelikte 12 Ağustos'ta yalnızca "sonraki: 11 Eylül" yazıyordu. Hesap
 * doğruydu ama **dün geçen 11 Ağustos ödemesi hiçbir yerde görünmüyordu** ve
 * uygulama tarihi yanlış hesaplıyormuş gibi duruyordu.
 */
function OdemeDurumu({ abonelik }: { abonelik: Abonelik }) {
  const gecmis = abonelik.lastPaymentDate;
  // Yalnızca yakın geçmiş gösteriliyor; iki ay önceki ödeme kimseye bir şey
  // söylemiyor ve satırı kalabalıklaştırıyor.
  const gecmisGun = gecmis === null ? null : -gunFarki(gecmis);
  const gecmisYakin = gecmisGun !== null && gecmisGun <= 7;

  if (abonelik.nextPaymentDate === null) {
    return (
      <div className="sm:w-36">
        <p className="text-sm text-slate-400 dark:text-slate-500">ödeme yok</p>
        {gecmisYakin && <GecmisOdeme tarih={gecmis!} gun={gecmisGun} />}
      </div>
    );
  }

  const gun = gunFarki(abonelik.nextPaymentDate);
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
        {tarihYaz(abonelik.nextPaymentDate)}
      </p>
      {gecmisYakin && <GecmisOdeme tarih={gecmis!} gun={gecmisGun} />}
    </div>
  );
}

/**
 * Yeni geçmiş ödeme.
 *
 * Üstü çizili ve soluk: geride kalmış bir olay olduğu tek bakışta belli
 * olsun, sıradaki ödemeyle karışmasın.
 */
function GecmisOdeme({ tarih, gun }: { tarih: string; gun: number }) {
  return (
    <p className="mt-1 flex items-center gap-1 text-xs whitespace-nowrap text-slate-400 dark:text-slate-500">
      <GecmisSimgesi />
      <span className="line-through">{tarihKisaYaz(tarih)}</span>
      <span>· {gun === 0 ? 'bugün' : `${gun} gün önce`}</span>
    </p>
  );
}

function GecmisSimgesi() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
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
  tehlikeli = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tehlikeli?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-md px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors',
        'focus-visible:ring-2 focus-visible:ring-marka-500/40 focus-visible:outline-none',
        'dark:text-slate-400',
        tehlikeli
          ? // Silme geri alınamaz; üzerine gelince kırmızıya dönerek
            // diğerlerinden ayrılıyor.
            'hover:bg-red-100 hover:text-red-700 group-hover:text-slate-700 dark:hover:bg-red-500/15 dark:hover:text-red-300 dark:group-hover:text-slate-300'
          : 'hover:bg-slate-200 hover:text-slate-900 group-hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-100 dark:group-hover:text-slate-300',
      ].join(' ')}
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
