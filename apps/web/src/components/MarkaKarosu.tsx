import { useState } from 'react';

/**
 * Aboneliğin marka karosu.
 *
 * ## Logolar depoda duruyor, dışarıdan çekilmiyor
 *
 * `tool/logo-indir.sh` logoları bir kez indirip depoya koyuyor; uygulama
 * kendi origin'inden sunuyor. Çalışma anında dış bir servisten çekmek iki
 * sebeple istenmez: içerik güvenlik politikası buna izin vermiyor
 * (`img-src 'self' data:`) ve o servis kullanıcının hangi aboneliklere sahip
 * olduğunu görürdü.
 *
 * ## Logo yoksa harf karosu
 *
 * Kullanıcı katalogda olmayan bir ad yazabiliyor ("Spor Salonu") ve bazı
 * markaların kullanılabilir çözünürlükte logosu bulunamıyor. O durumda
 * markanın rengi ve baş harfleri kullanılıyor. Görsel yüklenemezse de aynı
 * yere düşülüyor — kırık resim simgesi hiçbir zaman görünmüyor.
 */

interface MarkaKarosuProps {
  ad: string;
  /** Katalogdan gelen marka rengi; yoksa addan türetiliyor. */
  renk?: string | null | undefined;
  /** Depodaki logo yolu; yoksa harf karosu çiziliyor. */
  logo?: string | null | undefined;
  boyut?: 'kucuk' | 'normal';
}

export function MarkaKarosu({
  ad,
  renk,
  logo,
  boyut = 'normal',
}: MarkaKarosuProps) {
  const arkaPlan = renk ?? renkTuret(ad);
  const koyuMetin = acikRenkMi(arkaPlan);
  const [logoBozuk, setLogoBozuk] = useState(false);

  const olculer =
    boyut === 'kucuk' ? 'h-8 w-8 text-xs' : 'h-11 w-11 text-sm';

  if (logo != null && logo !== '' && !logoBozuk) {
    return (
      <span
        aria-hidden
        className={[
          'grid shrink-0 place-items-center overflow-hidden rounded-xl',
          // Beyaz zemin: çoğu logo şeffaf ve koyu renkli, marka renginin
          // üstünde okunmuyorlar.
          'bg-white ring-1 ring-slate-200 dark:ring-slate-700',
          olculer,
        ].join(' ')}
      >
        <img
          src={logo}
          alt=""
          loading="lazy"
          onError={() => setLogoBozuk(true)}
          className="h-[70%] w-[70%] object-contain"
        />
      </span>
    );
  }

  return (
    <span
      // Anlamı zaten yanındaki ad taşıyor; ekran okuyucu harfi tekrar
      // okumasın.
      aria-hidden
      className={[
        'grid shrink-0 place-items-center rounded-xl font-semibold select-none',
        olculer,
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
