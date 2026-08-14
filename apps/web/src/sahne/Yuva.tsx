import { useEffect, useRef, useState } from 'react';
import { YUMURTA_YUKSEKLIK, yumurtaYaricapi } from '../lib/yumurta';

/**
 * Kuş yuvası: altı yumurta, her birinde bir servisin logosu.
 *
 * "Ne kadar gidiyor" bölümünün görseli. Önce servis logolarından 3×3'lük
 * bir kare duvar vardı; yuva aynı bilgiyi markanın kendi diliyle
 * anlatıyor — Abonest "abone" ve "nest" (yuva) kelimelerinden geliyor,
 * logo da halkanın içindeki yumurta.
 *
 * ## Koreografi
 *
 * Bölüme gelirken bir kuş ağzında dal parçasıyla uçup yuvaya konuyor ve
 * dalı bırakıyor. Sonraki bölüme geçilirken yuvadan uçuyor. Dal yuvada
 * kalıyor: kuşun oraya bir şey **bıraktığı** görünsün diye.
 *
 * ## Neden bölümün içinde değil
 *
 * Bölümler etkin değilken `display: none` ile tamamen kalkıyor. Yuva
 * bölümün içinde olsaydı kuş uçarak ayrılamazdı — bölüm kapanır kapanmaz
 * yok olurdu. Bu yüzden yuva kendi katmanında ve kendi aşamalarını
 * yönetiyor; gidiş animasyonu bittikten sonra kayboluyor.
 */

export type YuvaAsamasi = 'yok' | 'geliyor' | 'kondu' | 'ucuyor';

/** Uçuş ve iniş; CSS'teki sürelerle eşleşmek zorunda. */
const GELIS_MS = 2100;
const GIDIS_MS = 1500;

const KUTU_G = 340;
const KUTU_Y = 250;

/** Yuvanın ağzının merkezi ve yarıçapları. */
const AGIZ = { x: KUTU_G / 2, y: 132, rx: 138, ry: 52 };

/**
 * Yuvanın dalları.
 *
 * Rastgele üretiliyor ama **sabit tohumla**: her çizimde aynı yuva
 * çıkıyor. Gerçek rastgelelik kullanılsaydı React her yeniden çizimde
 * dalları yeniden dizerdi ve yuva titrerdi.
 */
function yuvaDallari(): { d: string; genislik: number; renk: string }[] {
  let tohum = 20260814;
  const rastgele = () => {
    // Doğrusal eşlenik üreteç; kısa ve yeniden üretilebilir.
    tohum = (tohum * 1103515245 + 12345) % 2147483648;
    return tohum / 2147483648;
  };

  const renkler = ['#6B4A2B', '#8A6237', '#553A21', '#A07845', '#43301C'];
  const dallar: { d: string; genislik: number; renk: string }[] = [];

  for (let i = 0; i < 46; i++) {
    const aci = rastgele() * Math.PI * 2;
    const yayilma = 0.55 + rastgele() * 0.5;
    const x = AGIZ.x + Math.cos(aci) * AGIZ.rx * yayilma;
    const y = AGIZ.y + 34 + Math.sin(aci) * AGIZ.ry * yayilma * 1.5;
    const uzunluk = 46 + rastgele() * 92;
    const egim = (rastgele() - 0.5) * 0.9;
    const kavis = 16 + rastgele() * 26;

    dallar.push({
      d: `M${(x - uzunluk / 2).toFixed(1)},${y.toFixed(1)} q${(uzunluk / 2).toFixed(1)},${kavis.toFixed(1)} ${uzunluk.toFixed(1)},${(egim * 18).toFixed(1)}`,
      genislik: 2.4 + rastgele() * 3.4,
      renk: renkler[Math.floor(rastgele() * renkler.length)] ?? '#6B4A2B',
    });
  }
  return dallar;
}

const DALLAR = yuvaDallari();

/** Küçük bir yumurta yolu; şekil uygulamanın geri kalanıyla ortak. */
function kucukYumurta(cx: number, cy: number, yukseklik: number): string {
  const ADIM = 40;
  const olcek = yukseklik / (2 * YUMURTA_YUKSEKLIK);
  const sag: string[] = [];
  const sol: string[] = [];
  for (let i = 0; i <= ADIM; i++) {
    const aci = (i / ADIM) * Math.PI;
    const r = yumurtaYaricapi(aci) * olcek;
    const y = cy - Math.cos(aci) * YUMURTA_YUKSEKLIK * olcek;
    sag.push(`${(cx + r).toFixed(1)},${y.toFixed(1)}`);
    sol.push(`${(cx - r).toFixed(1)},${y.toFixed(1)}`);
  }
  sol.reverse();
  return `M${sag.join(' L')} L${sol.join(' L')} Z`;
}

/** Altı yumurtanın yuva içindeki yerleşimi: arkada üç, önde üç. */
const YUMURTALAR = [
  { x: 108, y: 126, h: 62, egim: -14 },
  { x: 170, y: 118, h: 66, egim: 2 },
  { x: 232, y: 128, h: 62, egim: 13 },
  { x: 132, y: 158, h: 68, egim: -8 },
  { x: 196, y: 162, h: 70, egim: 6 },
  { x: 258, y: 154, h: 64, egim: 17 },
];

export function Yuva({
  logolar,
  etkinBolum,
  bolumSirasi,
  azalt,
}: {
  logolar: readonly string[];
  etkinBolum: number;
  /** Yuvanın ait olduğu bölümün sırası. */
  bolumSirasi: number;
  azalt: boolean;
}) {
  const [asama, setAsama] = useState<YuvaAsamasi>('yok');
  const oncekiRef = useRef(etkinBolum);

  useEffect(() => {
    const onceki = oncekiRef.current;
    oncekiRef.current = etkinBolum;

    if (etkinBolum === bolumSirasi && onceki !== bolumSirasi) {
      if (azalt) {
        // Hareket azaltıldığında kuş uçmuyor, doğrudan yuvada duruyor.
        setAsama('kondu');
        return;
      }
      setAsama('geliyor');
      const z = window.setTimeout(() => {
        setAsama('kondu');
      }, GELIS_MS);
      return () => {
        window.clearTimeout(z);
      };
    }

    if (onceki === bolumSirasi && etkinBolum !== bolumSirasi) {
      if (azalt) {
        setAsama('yok');
        return;
      }
      setAsama('ucuyor');
      const z = window.setTimeout(() => {
        setAsama('yok');
      }, GIDIS_MS);
      return () => {
        window.clearTimeout(z);
      };
    }

    return undefined;
  }, [etkinBolum, bolumSirasi, azalt]);

  if (asama === 'yok') {
    return null;
  }

  return (
    <div className={`yuva yuva-${asama}`} aria-hidden>
      <svg viewBox={`0 0 ${String(KUTU_G)} ${String(KUTU_Y)}`} className="yuva-cizim">
        <defs>
          <linearGradient id="yuva-kabuk" x1="0.25" y1="0.05" x2="0.8" y2="0.95">
            <stop offset="0%" stopColor="#FFF4E2" />
            <stop offset="45%" stopColor="#F0CC9C" />
            <stop offset="100%" stopColor="#B87F49" />
          </linearGradient>

          {/* Yuvanın içi: yumurtaların arkasındaki karanlık çukur. */}
          <radialGradient id="yuva-cukur" cx="0.5" cy="0.42" r="0.55">
            <stop offset="0%" stopColor="#1B1108" />
            <stop offset="100%" stopColor="#3A2614" />
          </radialGradient>
        </defs>

        {/* Arka dallar → çukur → yumurtalar → ön dallar. */}
        <g className="yuva-dal-arka">
          {DALLAR.slice(0, 24).map((dal, i) => (
            <path
              key={`arka-${String(i)}`}
              d={dal.d}
              stroke={dal.renk}
              strokeWidth={dal.genislik}
              strokeLinecap="round"
              fill="none"
            />
          ))}
        </g>

        <ellipse
          cx={AGIZ.x}
          cy={AGIZ.y + 12}
          rx={AGIZ.rx * 0.72}
          ry={AGIZ.ry * 0.78}
          fill="url(#yuva-cukur)"
        />

        {YUMURTALAR.map((yumurta, i) => {
          const dosya = logolar[i];
          if (dosya === undefined) {
            return null;
          }
          const logoBoyu = yumurta.h * 0.42;
          return (
            <g
              key={dosya}
              transform={`rotate(${String(yumurta.egim)} ${String(yumurta.x)} ${String(yumurta.y)})`}
            >
              <path
                d={kucukYumurta(yumurta.x, yumurta.y, yumurta.h)}
                fill="url(#yuva-kabuk)"
              />
              {/*
                Logo yumurtanın yüzeyinde. Dik duruyor — yumurtayla
                birlikte eğilseydi logolar yan yatmış görünürdü ve
                markalar tanınmazdı.
              */}
              <g
                transform={`rotate(${String(-yumurta.egim)} ${String(yumurta.x)} ${String(yumurta.y)})`}
              >
                <image
                  href={`/logolar/${dosya}.png`}
                  x={yumurta.x - logoBoyu / 2}
                  y={yumurta.y - logoBoyu / 2}
                  width={logoBoyu}
                  height={logoBoyu}
                  preserveAspectRatio="xMidYMid meet"
                />
              </g>
            </g>
          );
        })}

        <g className="yuva-dal-on">
          {DALLAR.slice(24).map((dal, i) => (
            <path
              key={`on-${String(i)}`}
              d={dal.d}
              stroke={dal.renk}
              strokeWidth={dal.genislik}
              strokeLinecap="round"
              fill="none"
            />
          ))}
        </g>

        {/*
          Kuşun bıraktığı dal. Konduktan sonra yuvaya düşüyor ve orada
          kalıyor — kuş gittikten sonra da duruyor, bir şey bırakmış olması
          hikâyenin noktası.
        */}
        {asama !== 'geliyor' && (
          <path
            className="yuva-birakilan-dal"
            d="M118,96 q34,-13 74,-4"
            stroke="#C79A5E"
            strokeWidth="4.5"
            strokeLinecap="round"
            fill="none"
          />
        )}
      </svg>

      <Kus asama={asama} />
    </div>
  );
}

/**
 * Kızıl ara papağanı (*Ara macao*).
 *
 * ## Neden çizim, fotoğraf değil
 *
 * Fotoğraf istenmişti ama iki engel var. Birincisi telif: stok fotoğraf
 * sitelerindeki görseller lisanslı ve bu depo herkese açık. İkincisi ve
 * asıl olanı teknik — **tek karelik bir fotoğraf kanat çırpamaz.** Uçuş
 * animasyonu kanadın, kuyruğun ve gövdenin birbirinden bağımsız hareket
 * etmesini gerektiriyor; bunun için parçaların ayrı olması şart.
 *
 * ## Katmanlar
 *
 * Arkadan öne: uzak kanat, kuyruk, gövde, yakın kanat, baş, gaga. İki
 * kanat **zıt fazda** çırpıyor: biri yukarıdayken diğeri aşağıda. Tek
 * kanatlı ya da aynı fazda çırpan bir kuş kâğıttan kesilmiş gibi
 * duruyor, derinlik hissini bu fark veriyor.
 *
 * Renkler türünkinden: kızıl gövde, kanatta kızıldan sarıya ve maviye
 * giden bantlar, kuyruk ucu mavi, yüzde tüysüz beyaz deri, gagada açık
 * üst ve siyah alt gaga.
 */
function Kus({ asama }: { asama: YuvaAsamasi }) {
  return (
    <div className={`kus kus-${asama}`}>
      <svg viewBox="0 0 200 150" className="kus-cizim">
        <defs>
          <linearGradient id="ara-govde" x1="0.2" y1="0.1" x2="0.75" y2="0.9">
            <stop offset="0%" stopColor="#F0483C" />
            <stop offset="55%" stopColor="#CF1F22" />
            <stop offset="100%" stopColor="#8E1214" />
          </linearGradient>
          <linearGradient id="ara-kanat-ic" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#E63A2E" />
            <stop offset="100%" stopColor="#A81618" />
          </linearGradient>
          <linearGradient id="ara-kanat-orta" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFC93C" />
            <stop offset="100%" stopColor="#E08A15" />
          </linearGradient>
          <linearGradient id="ara-kanat-dis" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3B7FD4" />
            <stop offset="100%" stopColor="#17418C" />
          </linearGradient>
          <linearGradient id="ara-kuyruk" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D62A26" />
            <stop offset="62%" stopColor="#A81A1C" />
            <stop offset="100%" stopColor="#2A5CA8" />
          </linearGradient>
        </defs>

        {/* Uzak kanat: gövdenin arkasında, zıt fazda çırpıyor. */}
        <g className="kus-kanat kus-kanat-uzak">
          <path
            d="M104,70 C92,44 74,26 48,18 C54,42 68,64 86,78 C93,83 101,79 104,70 Z"
            fill="#8E1214"
            opacity="0.85"
          />
        </g>

        {/* Kuyruk: uzun, sivrilen tüyler; uçlar maviye dönüyor. */}
        <g className="kus-kuyruk">
          <path d="M92,88 L16,126 L24,133 L98,100 Z" fill="url(#ara-kuyruk)" />
          <path d="M94,82 L10,110 L15,118 L98,94 Z" fill="url(#ara-kuyruk)" />
          <path d="M96,77 L22,96 L24,104 L100,89 Z" fill="url(#ara-kuyruk)" opacity="0.9" />
        </g>

        {/* Gövde */}
        <path
          d="M96,96 C82,84 82,62 96,52 C110,42 132,44 143,54 C152,62 152,78 143,86
             C132,96 110,104 96,96 Z"
          fill="url(#ara-govde)"
        />

        {/* Karın: gövdenin altı biraz daha açık. */}
        <path
          d="M100,92 C94,84 95,70 102,63 C110,58 122,58 128,63 C120,80 110,90 100,92 Z"
          fill="#F2705E"
          opacity="0.35"
        />

        {/* Yakın kanat: üç bant — kızıl, sarı, mavi. */}
        <g className="kus-kanat kus-kanat-yakin">
          <path
            d="M110,64 C98,40 80,20 52,10 C58,36 74,60 94,74 C101,79 108,74 110,64 Z"
            fill="url(#ara-kanat-dis)"
          />
          <path
            d="M110,66 C100,46 86,30 64,20 C70,42 82,60 96,72 C102,77 108,74 110,66 Z"
            fill="url(#ara-kanat-orta)"
          />
          <path
            d="M111,68 C104,52 94,40 78,32 C84,50 92,62 100,71 C104,75 109,74 111,68 Z"
            fill="url(#ara-kanat-ic)"
          />
        </g>

        {/* Baş */}
        <circle cx="146" cy="60" r="20" fill="url(#ara-govde)" />

        {/*
          Yüzdeki tüysüz beyaz deri: türün en tanınır işareti. İnce kızıl
          çizgiler onun üstünden geçiyor.
        */}
        <ellipse cx="153" cy="58" rx="12" ry="13" fill="#F7EDE4" />
        <g stroke="#E06258" strokeWidth="0.9" opacity="0.75" fill="none">
          <path d="M144,52 q10,1 18,0" />
          <path d="M143,58 q11,1 20,0" />
          <path d="M144,64 q10,1 18,-1" />
        </g>

        {/* Göz */}
        <circle cx="155" cy="55" r="3.6" fill="#F6D77A" />
        <circle cx="155.6" cy="55" r="1.9" fill="#161009" />

        {/*
          Gaga: üstü büyük ve kancalı (açık boynuz rengi), altı siyah.
          Ara papağanını uzaktan bile belli eden şey bu siluet.
        */}
        <path
          d="M162,48 C176,48 186,56 184,66 C182,76 172,82 164,80 C169,72 170,60 162,48 Z"
          fill="#EDE3D2"
        />
        <path d="M164,72 C172,74 178,72 181,68 C178,78 170,82 163,80 Z" fill="#2A211A" />
        <path d="M163,53 C171,55 175,60 175,66" stroke="#C9BCA6" strokeWidth="1.4" fill="none" />

        {/* Ayaklar: yalnızca konduğunda görünüyor. */}
        <g className="kus-ayak">
          <path
            d="M112,96 l-2,10 M118,97 l1,10"
            stroke="#3B3128"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>

        {/* Ağzındaki dal — konunca bırakılıyor. */}
        <g className="kus-dal">
          <path
            d="M182,70 q20,-8 38,-4"
            stroke="#C79A5E"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
          <path d="M206,66 q6,-8 14,-7" stroke="#8FA860" strokeWidth="3" fill="none" />
        </g>
      </svg>
    </div>
  );
}
