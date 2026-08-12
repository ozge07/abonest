/**
 * Aboneliğin marka karosu.
 *
 * ## Neden logo dosyası yok
 *
 * Gerçek logolar ya dış bir servisten çekilir ya da depoya konur. Dış servis
 * bu uygulamanın içerik politikasıyla çalışmıyor (`img-src 'self' data:`) ve
 * her ekranı üçüncü bir tarafa bağımlı kılardı; markaların logo dosyalarını
 * depoya koymak ise ayrı bir izin meselesi.
 *
 * Bunun yerine markanın **rengi** ve baş harfleri kullanılıyor. Tanınırlığın
 * çoğu zaten renkten geliyor: kırmızı bir "N" karosu Netflix'i, yeşil bir "S"
 * Spotify'ı anında düşündürüyor. Hiçbir dış istek yok, çevrimdışı çalışıyor
 * ve hiçbir zaman kırık görsel çıkmıyor.
 */

interface MarkaKarosuProps {
  ad: string;
  /** Katalogdan gelen marka rengi; yoksa addan türetiliyor. */
  renk?: string | null | undefined;
  boyut?: 'kucuk' | 'normal';
}

export function MarkaKarosu({ ad, renk, boyut = 'normal' }: MarkaKarosuProps) {
  const arkaPlan = renk ?? renkTuret(ad);
  const koyuMetin = acikRenkMi(arkaPlan);

  return (
    <span
      // Anlamı zaten yanındaki ad taşıyor; ekran okuyucu harfi tekrar
      // okumasın.
      aria-hidden
      className={[
        'grid shrink-0 place-items-center rounded-xl font-semibold select-none',
        boyut === 'kucuk' ? 'h-8 w-8 text-xs' : 'h-11 w-11 text-sm',
      ].join(' ')}
      style={{
        backgroundColor: arkaPlan,
        color: koyuMetin ? '#0F172A' : '#FFFFFF',
      }}
    >
      {basHarfler(ad)}
    </span>
  );
}

/**
 * En fazla iki harf.
 *
 * Tek kelimelik adlarda ilk harf yeterli ("Netflix" → N); çok kelimeli
 * adlarda iki kelimenin baş harfi ayırt ediciliği artırıyor ("Spor Salonu"
 * → SS).
 */
function basHarfler(ad: string): string {
  const kelimeler = ad.trim().split(/\s+/).filter(Boolean);
  if (kelimeler.length === 0) {
    return '?';
  }
  if (kelimeler.length === 1) {
    return ilkHarf(kelimeler[0]!);
  }
  return ilkHarf(kelimeler[0]!) + ilkHarf(kelimeler[1]!);
}

/**
 * Türkçe büyütme.
 *
 * `toUpperCase()` "istanbul"un baş harfini "I" yapıyor; Türkçede "İ" olmalı.
 * Küçük bir ayrıntı ama yanlış olduğunda göze batıyor.
 */
function ilkHarf(kelime: string): string {
  const harf = [...kelime][0] ?? '';
  return harf === 'i' ? 'İ' : harf.toLocaleUpperCase('tr-TR');
}

/**
 * Marka rengi bilinmiyorsa addan **kararlı** bir renk üretiyor.
 *
 * Kararlı olması önemli: aynı abonelik her açılışta aynı renkte görünmeli,
 * yoksa kullanıcı listede aradığını renkten bulamaz. Rastgele değil, addan
 * türetilmiş bir özet kullanılıyor.
 *
 * Doygunluk ve parlaklık sabit: yalnızca ton değişiyor, böylece hiçbir renk
 * diğerlerinin yanında fazla parlak ya da soluk kalmıyor.
 */
function renkTuret(ad: string): string {
  let ozet = 0;
  for (const karakter of ad) {
    ozet = (ozet * 31 + karakter.codePointAt(0)!) % 360;
  }
  return `hsl(${ozet} 52% 42%)`;
}

/**
 * Arka plan açık mı — metin rengini seçmek için.
 *
 * WCAG'ın göreli parlaklık formülünün basitleştirilmiş hâli. Turkcell'in
 * sarısı gibi açık markalarda beyaz metin okunmuyordu.
 */
function acikRenkMi(renk: string): boolean {
  const eslesme = /^#([0-9a-f]{6})$/i.exec(renk);
  if (eslesme === null) {
    // Türetilmiş renkler sabit parlaklıkta ve koyu; beyaz metin doğru.
    return false;
  }

  const sayi = Number.parseInt(eslesme[1]!, 16);
  const kirmizi = (sayi >> 16) & 0xff;
  const yesil = (sayi >> 8) & 0xff;
  const mavi = sayi & 0xff;

  // Gözün yeşile duyarlılığı en yüksek, maviye en düşük.
  const parlaklik = (kirmizi * 299 + yesil * 587 + mavi * 114) / 1000;
  return parlaklik > 165;
}
