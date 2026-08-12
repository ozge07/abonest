/**
 * Para gösterimi.
 *
 * Tutarlar sunucudan **tamsayı kuruş** olarak geliyor ve arayüzde de öyle
 * kalıyor; yalnızca ekrana yazarken biçimlendiriliyor. Kuruşu bir yerde
 * ondalık sayıya çevirip tekrar geri çevirmek, para hesabında yuvarlama
 * hatasının klasik giriş kapısı.
 */

/** Para biriminin kaç ondalık basamağı olduğu. */
const BASAMAK: Record<string, number> = { TRY: 2, USD: 2, EUR: 2, GBP: 2 };

export function paraYaz(minor: number, currency: string): string {
  const basamak = BASAMAK[currency] ?? 2;

  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    minimumFractionDigits: basamak,
    maximumFractionDigits: basamak,
  }).format(minor / 10 ** basamak);
}

/**
 * Kullanıcının yazdığı tutarı kuruşa çeviriyor.
 *
 * Hem `199,90` hem `199.90` kabul ediliyor: Türkçe klavyede virgül ondalık
 * ayracı, ama kopyalanan tutarlar sık sık nokta içeriyor. Kullanıcıyı hangi
 * işareti kullanacağını düşünmeye zorlamanın bir faydası yok.
 */
export function tutariKurusaCevir(
  girdi: string,
  currency: string,
): number | null {
  const temiz = girdi.trim().replace(/\s/g, '').replace(',', '.');
  if (temiz === '' || !/^\d+(\.\d{0,4})?$/.test(temiz)) {
    return null;
  }

  const basamak = BASAMAK[currency] ?? 2;
  // Ondalık sayıyla çarpmak yerine metinden okuyoruz: 19.99 * 100 kayan
  // noktada 1998.9999... veriyor ve aşağı yuvarlanırsa bir kuruş kayboluyor.
  const [tam, kesir = ''] = temiz.split('.');
  const doldurulmus = kesir.padEnd(basamak, '0').slice(0, basamak);

  return Number(`${tam}${doldurulmus}`);
}

export function kurusuMetneCevir(minor: number, currency: string): string {
  const basamak = BASAMAK[currency] ?? 2;
  const bolen = 10 ** basamak;
  const tam = Math.floor(minor / bolen);
  const kesir = String(minor % bolen).padStart(basamak, '0');
  return basamak === 0 ? String(tam) : `${tam},${kesir}`;
}

const DONGU_ADI: Record<string, string> = {
  WEEKLY: 'haftalık',
  MONTHLY: 'aylık',
  QUARTERLY: '3 aylık',
  HALF_YEARLY: '6 aylık',
  YEARLY: 'yıllık',
  CUSTOM: 'özel',
};

export function donguYaz(cycle: string, customIntervalDays?: number | null): string {
  if (cycle === 'CUSTOM' && customIntervalDays != null) {
    return `${customIntervalDays} günde bir`;
  }
  return DONGU_ADI[cycle] ?? cycle;
}

export function tarihYaz(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${iso}T00:00:00Z`));
}

/**
 * Kısa tarih: "5 Ağu".
 *
 * Dar sütunlarda tam tarih ("5 Ağustos 2026") satıra sığmayıp kırılıyor.
 * Yıl atlanıyor çünkü bu biçim yalnızca yakın geçmiş/gelecek için
 * kullanılıyor; belirsizlik doğurmuyor.
 */
export function tarihKisaYaz(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${iso}T00:00:00Z`));
}

/** "3 gün sonra", "yarın", "bugün" — sayı yerine insan dili. */
export function gunSayisiYaz(gun: number): string {
  if (gun <= 0) return 'bugün';
  if (gun === 1) return 'yarın';
  return `${gun} gün sonra`;
}
