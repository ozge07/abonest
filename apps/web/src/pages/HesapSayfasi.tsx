import { SayfaBasligi } from '../components/SayfaBasligi';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  CURRENCIES,
  PURGE_AFTER_DAYS,
  adAlani,
  alanHatasi,
  sifreAlani,
} from '@abonelik/shared';
import { Alan, Dugme, HataKutusu, Secim } from '../components/form';
import { OnayKutusu } from '../components/OnayKutusu';
import { ApiError, api } from '../lib/api';
import { useAlan } from '../lib/alan';
import { useOturum } from '../lib/oturum';
import { tarihYaz } from '../lib/money';
import type { Kullanici } from '../lib/types';

/**
 * Hesap ayarları.
 *
 * Bu sayfa uzun süre eksikti: sunucuda profil güncelleme, şifre değiştirme,
 * oturum listesi ve hesap silme uçları vardı ama hiçbirinin ekranı yoktu.
 * Kullanıcı hesabını silmek istediğinde tıklayacağı bir yer yoktu.
 *
 * Bölümler tehlike sırasına göre diziliyor: önce sıradan ayarlar, en sonda
 * geri alması destek gerektiren işlem.
 */
export function HesapSayfasi() {
  const { kullanici } = useOturum();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <SayfaBasligi baslik="Hesabım" />
      {/*
        `key`: profil formu alanlarını **ilk çizimde** kullanıcıdan
        dolduruyor. Veri sonradan gelirse (ya da başka bir kullanıcıya
        geçilirse) alanlar eskide kalırdı — form boş görünür, kaydete
        basınca "ad en az 3 karakter" derdi. Kimlik değişince bileşen
        yeniden kuruluyor ve alanlar doğru değerle başlıyor.

        Uygulamada kabuk zaten kullanıcıyı bekliyor, yani bu durum bugün
        oluşmuyor; ama doğruluğu o tesadüfe bırakmıyoruz.
      */}
      <ProfilBolumu key={kullanici?.id ?? 'yukleniyor'} />
      <SifreBolumu />
      <OturumlarBolumu />
      <TehlikeliBolum />
    </div>
  );
}

function Bolum({
  baslik,
  aciklama,
  children,
  tehlikeli = false,
}: {
  baslik: string;
  aciklama?: string;
  children: ReactNode;
  tehlikeli?: boolean;
}) {
  return (
    <section
      className={[
        'cam rounded-xl p-5',
        tehlikeli
          ? 'border-red-300 dark:border-red-900/60'
          : '',
      ].join(' ')}
    >
      <h2
        className={[
          'font-medium',
          tehlikeli ? 'text-red-700 dark:text-red-400' : '',
        ].join(' ')}
      >
        {baslik}
      </h2>
      {aciklama !== undefined && (
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {aciklama}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ProfilBolumu() {
  const { kullanici } = useOturum();
  const queryClient = useQueryClient();
  const [ad, setAd] = useState(kullanici?.name ?? '');
  const [paraBirimi, setParaBirimi] = useState(kullanici?.currency ?? 'TRY');
  const [kaydedildi, setKaydedildi] = useState(false);
  const [gonderildi, setGonderildi] = useState(false);

  const kaydet = useMutation({
    mutationFn: (girdi: { name: string; currency: string }) =>
      api.patch<Kullanici>('/me', girdi),
    onSuccess: async () => {
      setKaydedildi(true);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });

  const hata = kaydet.error;
  const alanHatalari = hata instanceof ApiError ? hata.alanHatalari : {};
  // Yazarken kızarmıyor: hata ancak kaydete basıldıktan sonra görünüyor.
  const adHatasi = gonderildi ? alanHatasi(adAlani, ad) : undefined;

  function gonder(olay: FormEvent) {
    olay.preventDefault();
    setGonderildi(true);
    setKaydedildi(false);
    if (alanHatasi(adAlani, ad) !== undefined) {
      return;
    }
    kaydet.mutate({ name: ad, currency: paraBirimi });
  }

  return (
    <Bolum baslik="Profil">
      <form onSubmit={gonder} noValidate className="flex flex-col gap-4">
        {hata instanceof ApiError && hata.problem.errors === undefined && (
          <HataKutusu mesaj={hata.problem.title} />
        )}

        <Alan
          etiket="Ad"
          name="name"
          value={ad}
          onChange={(olay) => {
            setAd(olay.target.value);
            setKaydedildi(false);
          }}
          hata={adHatasi ?? alanHatalari['name']}
        />

        <Secim
          etiket="Varsayılan para birimi"
          name="currency"
          value={paraBirimi}
          onChange={(olay) => {
            setParaBirimi(olay.target.value);
            setKaydedildi(false);
          }}
          hata={alanHatalari['currency']}
        >
          {CURRENCIES.map((birim) => (
            <option key={birim} value={birim}>
              {birim}
            </option>
          ))}
        </Secim>

        <p className="text-sm text-slate-500 dark:text-slate-400">
          E-posta: {kullanici?.email}
        </p>

        {/*
          Düğme satırın **sonunda**, onay yazısı solunda.
          
          Sıra önemli: düğme son eleman olduğu için kartın sağ kenarıyla
          hizalı kalıyor. Ters sırada "Kaydedildi" yazısı belirdiğinde
          düğme sola kayardı — yani ekranda bir şey her kaydedişte yer
          değiştirirdi.
        */}
        <div className="flex items-center justify-end gap-3">
          {kaydedildi && (
            <span className="text-sm text-green-700 dark:text-green-400">
              Kaydedildi
            </span>
          )}
          <Dugme type="submit" bekliyor={kaydet.isPending}>
            Kaydet
          </Dugme>
        </div>
      </form>
    </Bolum>
  );
}

function SifreBolumu() {
  const queryClient = useQueryClient();
  const [tamam, setTamam] = useState(false);

  const degistir = useMutation({
    mutationFn: (girdi: { currentPassword: string; newPassword: string }) =>
      api.patch<void>('/me/password', girdi),
    onSuccess: async () => {
      setTamam(true);
      // Sunucu diğer oturumları kapatıyor; liste bunu yansıtmalı.
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  const hata = degistir.error;
  const alanHatalari = hata instanceof ApiError ? hata.alanHatalari : {};

  const mevcut = useAlan(
    z.string().min(1, 'Mevcut şifreni yaz'),
    alanHatalari['currentPassword'],
  );
  const yeni = useAlan(sifreAlani, alanHatalari['newPassword']);

  function gonder(olay: FormEvent) {
    olay.preventDefault();
    setTamam(false);
    mevcut.gonderildi();
    yeni.gonderildi();
    if (!mevcut.gecerli || !yeni.gecerli) {
      return;
    }
    degistir.mutate({
      currentPassword: mevcut.deger,
      newPassword: yeni.deger,
    });
  }

  return (
    <Bolum
      baslik="Şifre"
      aciklama="Şifreni değiştirdiğinde diğer cihazlardaki oturumların kapanıyor; bu cihaz açık kalıyor."
    >
      <form onSubmit={gonder} noValidate className="flex flex-col gap-4">
        {/*
          "Mevcut şifre hatalı" alan hatası olarak değil, 401 gövdesi olarak
          geliyor; kutuda gösteriliyor.
        */}
        {hata instanceof ApiError && hata.problem.errors === undefined && (
          <HataKutusu mesaj={hata.problem.title} />
        )}

        <Alan
          etiket="Mevcut şifre"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          hata={mevcut.hata}
          {...mevcut.bagla}
        />

        <Alan
          etiket="Yeni şifre"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          hata={yeni.hata}
          {...yeni.bagla}
        />

        <div className="flex items-center justify-end gap-3">
          {tamam && (
            <span className="text-sm text-green-700 dark:text-green-400">
              Şifren değişti
            </span>
          )}
          <Dugme type="submit" bekliyor={degistir.isPending}>
            Şifreyi değiştir
          </Dugme>
        </div>
      </form>
    </Bolum>
  );
}

interface Oturum {
  id: string;
  userAgent: string | null;
  lastSeenAt: string;
  createdAt: string;
  current: boolean;
}

function OturumlarBolumu() {
  const queryClient = useQueryClient();

  const sorgu = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.get<Oturum[]>('/me/sessions'),
  });

  const kapat = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/me/sessions/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  const oturumlar = sorgu.data ?? [];

  return (
    <Bolum
      baslik="Açık oturumlar"
      aciklama="Tanımadığın bir cihaz görüyorsan kapat ve şifreni değiştir."
    >
      {sorgu.isPending ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Yükleniyor…</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {oturumlar.map((oturum) => (
            <li
              key={oturum.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {cihazAdi(oturum.userAgent)}
                  {oturum.current && (
                    /*
                     * Bu işaret olmadan kullanıcı "şüpheli oturumu kapat"
                     * derken kendini atabiliyordu; hangi satırın kendisi
                     * olduğunu anlamasının başka yolu yok.
                     */
                    <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-normal text-green-800 dark:bg-green-500/15 dark:text-green-300">
                      bu cihaz
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Son görülme: {tarihYaz(oturum.lastSeenAt.slice(0, 10))}
                </p>
              </div>

              {!oturum.current && (
                <button
                  type="button"
                  onClick={() => kapat.mutate(oturum.id)}
                  disabled={kapat.isPending}
                  className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  Kapat
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Bolum>
  );
}

/**
 * Tarayıcı kimliğinden okunabilir bir cihaz adı.
 *
 * Ham `user-agent` metni kullanıcıya hiçbir şey söylemiyor. Buradaki kaba
 * eşleme "hangi cihazdı" sorusuna yetiyor; tam doğruluk gerekmiyor, çünkü
 * verilecek karar zaten "bunu ben mi açtım" sorusuna dayanıyor.
 *
 * Sıra önemli: Edge ve Chrome ikisi de `Safari/` içeriyor, Edge ayrıca
 * `Chrome/` içeriyor — daha özel olan önce sınanıyor.
 */
function cihazAdi(userAgent: string | null): string {
  if (userAgent === null || userAgent === '') {
    return 'Bilinmeyen cihaz';
  }

  const tarayici = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Tarayıcı';

  const sistem = /iPhone|iPad/.test(userAgent)
    ? 'iOS'
    : /Android/.test(userAgent)
      ? 'Android'
      : /Mac OS X/.test(userAgent)
        ? 'Mac'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : '';

  return sistem === '' ? tarayici : `${tarayici} · ${sistem}`;
}

/**
 * Hesap silme.
 *
 * En altta ve kırmızı çerçevede: kullanıcının buraya kazayla düşmesi zor
 * olmalı. Metin silmenin geri alınabilir olduğunu söylüyor —
 * "kalıcı olarak siliniyor" demek doğru olmazdı, insanı olduğundan fazla
 * korkutmaktan başka işe yaramazdı.
 */
function TehlikeliBolum() {
  const queryClient = useQueryClient();
  const [soruluyor, setSoruluyor] = useState(false);
  const [silindi, setSilindi] = useState<string | null>(null);

  const sil = useMutation({
    mutationFn: () => api.delete<{ purgeAt: string }>('/me'),
    onSuccess: (yanit) => {
      setSoruluyor(false);
      setSilindi(yanit.purgeAt);
    },
  });

  if (silindi !== null) {
    return (
      <Bolum baslik="Hesabın silindi" tehlikeli>
        {/*
          "Destekle iletişime geç" yazmıyor: bu uygulamada destek masası yok,
          yazılsaydı olmayan bir kapıyı işaret ederdi. Kullanıcının kendi
          başına yapabileceği bir şey söylüyoruz — geri dönüş yolu artık
          giriş ekranından geçiyor, kimseye ulaşmak gerekmiyor.
        */}
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Verilerin {tarihYaz(silindi.slice(0, 10))} tarihine kadar duruyor, o
          gün kalıcı olarak siliniyor. Fikrini değiştirirsen{' '}
          <strong className="font-semibold">
            o tarihe kadar aynı e-posta ve şifreyle giriş yap
          </strong>
          , hesabın aboneliklerinle birlikte geri gelir.
        </p>
        <div className="mt-4">
          <Dugme
            onClick={() => {
              /*
               * Oturumlar sunucuda zaten kapandı; `/auth/logout` çağırmak
               * 401 dönerdi. Önbelleği temizlemek uygulamayı giriş
               * ekranına düşürüyor.
               */
              queryClient.clear();
            }}
          >
            Çıkış yap
          </Dugme>
        </div>
      </Bolum>
    );
  }

  return (
    <Bolum
      baslik="Hesabı sil"
      aciklama={`Aboneliklerin, ödeme geçmişin ve bildirimlerin kapanır. ${PURGE_AFTER_DAYS} gün içinde tekrar giriş yaparak geri getirebilirsin; sonra veriler kalıcı olarak siliniyor.`}
      tehlikeli
    >
      <button
        type="button"
        onClick={() => setSoruluyor(true)}
        className="rounded-md border border-red-300 px-3.5 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:outline-none dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-500/10"
      >
        Hesabımı sil
      </button>

      {sil.error instanceof ApiError && (
        <div className="mt-3">
          <HataKutusu mesaj={sil.error.problem.title} />
        </div>
      )}

      {soruluyor && (
        <OnayKutusu
          baslik="Hesabın silinsin mi?"
          aciklama={`Bütün aboneliklerin ve geçmişin kapatılıyor, açık oturumların düşüyor. ${PURGE_AFTER_DAYS} gün içinde aynı şifreyle giriş yaparsan hesabın geri gelir; o süre dolunca veriler kalıcı olarak siliniyor.`}
          onaylaEtiketi="Evet, hesabımı sil"
          bekliyor={sil.isPending}
          onOnayla={() => sil.mutate()}
          onVazgec={() => setSoruluyor(false)}
        />
      )}
    </Bolum>
  );
}
