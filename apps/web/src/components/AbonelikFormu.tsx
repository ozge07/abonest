import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../lib/api';
import { tutariKurusaCevir } from '../lib/money';
import type { Abonelik, Kategori, Saglayici } from '../lib/types';
import { Alan, Dugme, HataKutusu, Secim } from './form';
import { SaglayiciSecici } from './SaglayiciSecici';

const PARA_BIRIMLERI = ['TRY', 'USD', 'EUR', 'GBP'] as const;

const DONGULER = [
  { deger: 'MONTHLY', ad: 'Aylık' },
  { deger: 'YEARLY', ad: 'Yıllık' },
  { deger: 'WEEKLY', ad: 'Haftalık' },
  { deger: 'QUARTERLY', ad: '3 aylık' },
  { deger: 'HALF_YEARLY', ad: '6 aylık' },
  { deger: 'CUSTOM', ad: 'Özel aralık' },
] as const;

export function AbonelikFormu({
  onKapat,
  onKaydedildi,
}: {
  onKapat: () => void;
  onKaydedildi: () => void;
}) {
  const queryClient = useQueryClient();

  const kategoriler = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Kategori[]>('/categories'),
  });

  const saglayicilar = useQuery({
    queryKey: ['providers'],
    queryFn: () => api.get<Saglayici[]>('/providers'),
  });

  const [ad, setAd] = useState('');
  /*
   * Seçilen sağlayıcı **kaydediliyor**.
   *
   * Önce yalnızca formu dolduruyor, `providerId` gönderilmiyordu: katalogdaki
   * marka bilgisi aboneliğe hiç bağlanmıyor, dolayısıyla listede marka rengi
   * ve rozeti gösterilemiyordu. Veritabanında 19 aboneliğin 19'u sağlayıcısız
   * duruyordu.
   */
  const [saglayiciId, setSaglayiciId] = useState('');
  const [tutar, setTutar] = useState('');
  const [paraBirimi, setParaBirimi] = useState('TRY');
  const [dongu, setDongu] = useState('MONTHLY');
  const [aralik, setAralik] = useState('30');
  const [kategoriId, setKategoriId] = useState('');
  const [baslangic, setBaslangic] = useState(bugununTarihi());
  const [tutarHatasi, setTutarHatasi] = useState<string | undefined>();

  const kaydet = useMutation({
    mutationFn: (girdi: Record<string, unknown>) =>
      api.post<Abonelik>('/subscriptions', girdi),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onKaydedildi();
    },
  });

  const hata = kaydet.error;
  const alanHatalari = hata instanceof ApiError ? hata.alanHatalari : {};

  /**
   * Sağlayıcı seçilince formu dolduruyor.
   *
   * Fiyatı doldurmuyoruz: sağlayıcıların fiyatları sık değişiyor ve
   * kataloğumuzda tutulmuyor. Yanlış bir fiyatı hazır getirmek, kullanıcının
   * kontrol etmeden kaydetmesine yol açardı.
   */
  function saglayiciSec(saglayici: Saglayici | null) {
    if (saglayici === null) {
      setSaglayiciId('');
      return;
    }
    setSaglayiciId(saglayici.id);
    setAd(saglayici.name);
    if (saglayici.defaultCategoryId !== null) {
      setKategoriId(saglayici.defaultCategoryId);
    }
    if (saglayici.defaultBillingCycle !== null) {
      setDongu(saglayici.defaultBillingCycle);
    }
    if (saglayici.defaultCurrency !== null) {
      setParaBirimi(saglayici.defaultCurrency);
    }
  }

  function gonder(olay: FormEvent) {
    olay.preventDefault();

    const priceMinor = tutariKurusaCevir(tutar, paraBirimi);
    if (priceMinor === null) {
      setTutarHatasi('Geçerli bir tutar yaz, örneğin 199,90');
      return;
    }
    setTutarHatasi(undefined);

    kaydet.mutate({
      name: ad,
      categoryId: kategoriId,
      priceMinor,
      currency: paraBirimi,
      billingCycle: dongu,
      startDate: baslangic,
      ...(saglayiciId !== '' ? { providerId: saglayiciId } : {}),
      ...(dongu === 'CUSTOM' ? { customIntervalDays: Number(aralik) } : {}),
    });
  }

  return (
    <form
      onSubmit={gonder}
      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white/80 backdrop-blur-xl p-5 dark:border-slate-800 dark:bg-slate-900/70"
    >
      <h2 className="font-medium">Yeni abonelik</h2>

      {hata instanceof ApiError && hata.problem.errors === undefined && (
        <HataKutusu mesaj={hata.problem.title} />
      )}

      <SaglayiciSecici
        saglayicilar={saglayicilar.data ?? []}
        seciliId={saglayiciId}
        onSec={saglayiciSec}
      />

      <Alan
        etiket="Ad"
        name="name"
        required
        value={ad}
        onChange={(o) => setAd(o.target.value)}
        hata={alanHatalari['name']}
        ipucu={
          saglayiciId === ''
            ? 'Listede yoksa kendin yaz — spor salonu, aidat, kira…'
            : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Alan
          etiket="Tutar"
          name="priceMinor"
          inputMode="decimal"
          required
          placeholder="199,90"
          value={tutar}
          onChange={(o) => setTutar(o.target.value)}
          hata={tutarHatasi ?? alanHatalari['priceMinor']}
        />

        <Secim
          etiket="Para birimi"
          name="currency"
          value={paraBirimi}
          onChange={(o) => setParaBirimi(o.target.value)}
          hata={alanHatalari['currency']}
        >
          {PARA_BIRIMLERI.map((birim) => (
            <option key={birim} value={birim}>
              {birim}
            </option>
          ))}
        </Secim>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Secim
          etiket="Ödeme sıklığı"
          name="billingCycle"
          value={dongu}
          onChange={(o) => setDongu(o.target.value)}
          hata={alanHatalari['billingCycle']}
        >
          {DONGULER.map((secenek) => (
            <option key={secenek.deger} value={secenek.deger}>
              {secenek.ad}
            </option>
          ))}
        </Secim>

        {/*
         * Kategori her zaman aynı yerde. Önceki hâlinde CUSTOM seçilince
         * kategori alanı aşağı kayıyordu; kullanıcının gözü az önce
         * doldurduğu alanı yeniden aramak zorunda kalıyordu.
         */}
        <Secim
          etiket="Kategori"
          name="categoryId"
          required
          value={kategoriId}
          onChange={(o) => setKategoriId(o.target.value)}
          hata={alanHatalari['categoryId']}
        >
          <option value="">— seç —</option>
          {(kategoriler.data ?? []).map((kategori) => (
            <option key={kategori.id} value={kategori.id}>
              {kategori.name}
            </option>
          ))}
        </Secim>
      </div>

      {dongu === 'CUSTOM' && (
        <Alan
          etiket="Kaç günde bir"
          name="customIntervalDays"
          type="number"
          min={1}
          required
          value={aralik}
          onChange={(o) => setAralik(o.target.value)}
          hata={alanHatalari['customIntervalDays']}
        />
      )}

      <Alan
        etiket="İlk ödeme tarihi"
        name="startDate"
        type="date"
        required
        value={baslangic}
        onChange={(o) => setBaslangic(o.target.value)}
        hata={alanHatalari['startDate']}
        ipucu="Aboneliğin başladığı ya da bir sonraki ödemenin düştüğü tarih."
      />

      <div className="flex gap-2">
        <Dugme type="submit" bekliyor={kaydet.isPending}>
          Kaydet
        </Dugme>
        <Dugme type="button" ikincil onClick={onKapat}>
          Vazgeç
        </Dugme>
      </div>
    </form>
  );
}

function bugununTarihi(): string {
  return new Date().toISOString().slice(0, 10);
}
