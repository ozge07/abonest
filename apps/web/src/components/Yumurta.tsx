import { YUMURTA_YUKSEKLIK, yumurtaYaricapi } from '../lib/yumurta';

/**
 * Gerçek bir yumurta — parçacık bulutu değil, kabuk.
 *
 * Giriş ekranında önce noktalardan oluşan bir yumurta vardı. Uzaktan
 * yumurta okunuyordu ama yakından bir nokta bulutuydu; markanın simgesi
 * olan şeyin kenarı belirsiz olmamalı.
 *
 * ## Şekil nereden geliyor
 *
 * Yol, `lib/yumurta.ts` içindeki bağıntıdan **hesaplanıyor**; elle
 * çizilmiş bir eğri değil. Hikâyedeki 3B kabuk da aynı bağıntıyı
 * kullanıyor, yani iki ekranda birebir aynı yumurta duruyor. Elle
 * çizilseydi biri ayarlandığında diğeri geride kalırdı.
 *
 * ## Hacim üç katmandan geliyor
 *
 * 1. Kabuk dolgusu — sol üstten sağ alta doğru koyulaşan geçiş.
 * 2. Ana parlama — ışığın vurduğu yerdeki yumuşak beyaz.
 * 3. Sıçrama ışığı — alt kenarda, zeminden yansıyan ince aydınlık.
 *
 * Üçüncüsü olmadan yumurtanın altı ölü bir koyulukta kalıyor ve şekil
 * yarım daireye benziyor. Gerçek bir yumurtayı fotoğrafta yumurta yapan
 * şey büyük ölçüde bu.
 */

/** Yolun çizildiği kutu; şekil bunun ortasına oturuyor. */
const KUTU = 220;

/** Yumurtanın yolu, dönel profilden türetiliyor. */
function yumurtaYolu(): string {
  const ADIM = 72;
  const olcek = (KUTU * 0.46) / YUMURTA_YUKSEKLIK;
  const merkez = KUTU / 2;

  const sag: string[] = [];
  const sol: string[] = [];
  for (let i = 0; i <= ADIM; i++) {
    const aci = (i / ADIM) * Math.PI;
    const yaricap = yumurtaYaricapi(aci) * olcek;
    // `cos` tepede +1; ekran ekseni aşağı doğru olduğu için işaret ters.
    const y = merkez - Math.cos(aci) * YUMURTA_YUKSEKLIK * olcek;
    sag.push(`${(merkez + yaricap).toFixed(2)},${y.toFixed(2)}`);
    sol.push(`${(merkez - yaricap).toFixed(2)},${y.toFixed(2)}`);
  }
  sol.reverse();
  return `M${sag.join(' L')} L${sol.join(' L')} Z`;
}

const YOL = yumurtaYolu();

export function Yumurta({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${String(KUTU)} ${String(KUTU)}`}
      className={className}
      role="img"
      aria-label="Abonest"
    >
      <defs>
        <linearGradient id="kabuk-dolgu" x1="0.22" y1="0.04" x2="0.82" y2="0.96">
          <stop offset="0%" stopColor="#FFF3DE" />
          <stop offset="38%" stopColor="#F3CE99" />
          <stop offset="72%" stopColor="#D69C5C" />
          <stop offset="100%" stopColor="#8E5C2C" />
        </linearGradient>

        {/* Işığın vurduğu yer: sol üstte, kenara değmeden sönüyor. */}
        <radialGradient id="kabuk-parlama" cx="0.35" cy="0.26" r="0.42">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#FFFFFF" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>

        {/* Sıçrama ışığı: alttaki ölü koyuluğu açıyor. */}
        <radialGradient id="kabuk-sicrama" cx="0.6" cy="0.9" r="0.4">
          <stop offset="0%" stopColor="#FFC98A" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#FFC98A" stopOpacity="0" />
        </radialGradient>

        {/* Soğuk kenar ışığı: sağ kenarda ince bir çizgi. */}
        <linearGradient id="kabuk-kenar" x1="1" y1="0.3" x2="0.55" y2="0.75">
          <stop offset="0%" stopColor="#BFD8FF" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#BFD8FF" stopOpacity="0" />
        </linearGradient>

        {/*
          Parlamalar kabuğun dışına taşmasın diye kırpılıyor. Kırpma
          olmadan radyal geçişler yumurtanın kenarından dışarı sızıyor ve
          şekil bulanık bir lekeye dönüşüyor.
        */}
        <clipPath id="kabuk-sinir">
          <path d={YOL} />
        </clipPath>
      </defs>

      <path d={YOL} fill="url(#kabuk-dolgu)" />
      <g clipPath="url(#kabuk-sinir)">
        <rect width={KUTU} height={KUTU} fill="url(#kabuk-parlama)" />
        <rect width={KUTU} height={KUTU} fill="url(#kabuk-sicrama)" />
        <rect width={KUTU} height={KUTU} fill="url(#kabuk-kenar)" />
      </g>
    </svg>
  );
}
