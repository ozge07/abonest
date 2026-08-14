import { LazyMotion, domAnimation, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { Yumurta } from './Yumurta';

/**
 * Girişten sonraki geçişin adımları.
 *
 * Yumurtanın kırılma animasyonunun yerini aldı; koreografi aynı kaldı
 * (beklenti → toplanma → ışık → uygulama), oyuncu değişti.
 */
export type GirisAsamasi = 'dinlenme' | 'hizlanma' | 'toplanma';

/**
 * Yörüngede dönen abonelik logoları.
 *
 * 21st.dev'deki "orbiting circles" bileşeninden uyarlandı.
 *
 * ## Logolar depodan geliyor
 *
 * Kaynak bileşen simgeleri `images.shadcnspace.com`'dan çekiyordu; bu
 * uygulamanın içerik güvenlik politikası dış görsele izin vermiyor
 * (`img-src 'self' data:`), yani o hâliyle ekranda hiçbir simge
 * görünmezdi. Zaten Supabase ve Figma logoları bir abonelik takip
 * uygulamasında ne arıyor belli değil — burada kullanıcının gerçekten
 * takip ettiği servisler dönüyor.
 *
 * ## Derinlik nereden geliyor
 *
 * Halkalar `rotateX` ile yatırılıyor, yani ekranda elips olarak görünen
 * gerçek birer yörünge düzlemi. Kapsayıcıdaki `perspective` sayesinde
 * uzaktaki simgeler **kendiliğinden** küçülüyor: boyut farkını elle
 * hesaplamıyoruz, tarayıcı 3B izdüşümü yapıyor. Yörüngenin arka
 * yarısındaki simgeler ayrıca kürenin gerisinde kalıyor.
 *
 * Simgelerin kameraya bakması için yatırma geri alınıyor
 * (`rotateX(-eğim)`); yoksa yatırılmış düzlemde ezilmiş görünürlerdi.
 *
 * ## Dönüşüm sırası
 *
 * Motion bütün dönüşümleri tek bir `transform` dizesinde **sabit bir
 * sırayla** birleştiriyor: `rotate` her zaman `rotateX`'ten önce geliyor.
 * Simgenin kameraya dönmesi tam olarak bu sıraya dayanıyor — önce
 * halkanın dönüşü geri alınıyor, sonra yatırma. Ters sırada simgeler
 * eğri dururdu.
 */

/** Halkanın eğimi (derece). Simgeler tam bu kadar geri dönüyor. */
const EGIM = 44;

interface Yorunge {
  /**
   * Halkanın çapı, kapsayıcının **yüzdesi** olarak.
   *
   * Sabit `rem` değildi: giriş ekranının sol sütunu geniş ekranda 400,
   * dar ekranda 300 piksel oluyor ve sabit çaplı halkalar oraya
   * sığmıyordu. Yüzdeyle bileşen konduğu yere uyuyor.
   */
  cap: number;
  /** Bir turun süresi (sn). Dıştaki halkalar daha yavaş dönüyor. */
  sure: number;
  /** İlk simgenin açısı; halkalar birbirine göre kaydırılıyor. */
  faz: number;
  /** `public/logolar` altındaki dosya adları. */
  logolar: string[];
}

/*
 * Her servis yörüngede **bir kez** görünüyor.
 *
 * Önce her logo 180° karşısına da konuyordu: iki Netflix, iki Spotify
 * dönüyordu. Halkayı dengeliyordu ama kullanıcının aboneliklerini anlatan
 * bir görselde aynı servisin iki kez olması yanlış bir şey söylüyor.
 * Denge artık açıların halka üzerinde eşit aralıkla hesaplanmasından
 * geliyor.
 */
const YORUNGELER: Yorunge[] = [
  {
    cap: 52,
    sure: 26,
    faz: -30,
    logolar: ['netflix', 'spotify', 'youtube-premium'],
  },
  {
    cap: 76,
    sure: 34,
    faz: 25,
    logolar: ['claude-pro', 'icloud-plus', 'disney-plus', 'notion'],
  },
  {
    cap: 100,
    sure: 44,
    faz: -15,
    logolar: [
      'duolingo-super',
      'amazon-prime-video',
      'canva',
      'microsoft-365',
      'playstation-plus',
    ],
  },
];

/** Dosya adından okunabilir ad: `youtube-premium` → `Youtube premium`. */
function okunabilirAd(dosya: string): string {
  const bosluklu = dosya.replaceAll('-', ' ');
  return bosluklu.charAt(0).toUpperCase() + bosluklu.slice(1);
}

export function YorungeHalkalari({
  asama = 'dinlenme',
}: {
  asama?: GirisAsamasi;
}) {
  /*
   * Hareket azaltma açıkken hiçbir şey dönmüyor ama diziliş bozulmuyor:
   * her simge başlangıç açısında ve kameraya dönük kalıyor. Motion'ın
   * kendi kancası işletim sistemi tercihini izliyor ve tercih
   * değiştiğinde bileşeni yeniden çiziyor.
   */
  const azalt = useReducedMotion() === true;

  /** Sonsuz ve tekdüze dönüş; hareket azaltıldığında hiç oynamıyor. */
  const donus = (sure: number) =>
    azalt
      ? { duration: 0 }
      : { duration: sure, ease: 'linear' as const, repeat: Infinity };

  return (
    /*
     * `LazyMotion` + `m`: paketin tamamı yerine yalnızca gereken
     * özellikler yükleniyor. Ölçüldü — indirilen dosya 39,5 kB yerine
     * 26,0 kB büyüyor. `strict` ise yanlışlıkla tam `motion` bileşeni
     * kullanılırsa hata veriyor; yoksa bu kazanç sessizce kaybolurdu.
     */
    <LazyMotion features={domAnimation} strict>
      <m.div
        /*
         * Aşama sınıfı yalnızca durumu belgeliyor; animasyonu artık CSS
         * değil Motion sürüyor. Testler bu sınıfa bakarak sıranın
         * bozulmadığını doğruluyor.
         */
        className={`yorunge yorunge-${asama} relative grid aspect-square w-full place-items-center`}
        animate={asama}
        variants={{
          dinlenme: { scale: 1, opacity: 1 },
          // Beklenti: toplanmadan önce hafifçe büyüyor.
          hizlanma: {
            scale: 1.06,
            opacity: 1,
            transition: { duration: 0.8, ease: 'easeIn' },
          },
          // Merkeze çöküp sönüyor; ışık patlaması bunun üstüne biniyor.
          toplanma: {
            scale: 0.12,
            opacity: 0,
            transition: { duration: 0.7, ease: [0.55, 0, 0.9, 0.4] },
          },
        }}
      >
        {/*
          Ortadaki yumurta yatırılmıyor: kameraya bakan tek düzlem o.
          Arkadan geçen simgeler `preserve-3d` sayesinde onun gerisinde
          kalıyor.
        */}
        <div className="yorunge-yumurta absolute h-[34%] w-[34%]">
          <Yumurta className="h-full w-full" />
        </div>

        {YORUNGELER.map((yorunge, sira) => {
          // Komşu halkalar ters yönde dönüyor; hepsi aynı yöne dönseydi
          // tek bir kütle gibi görünürdü.
          const yon = sira % 2 === 0 ? 1 : -1;
          const aralik = 360 / yorunge.logolar.length;

          return (
            <div
              key={yorunge.cap}
              className="yorunge-halka absolute rounded-full border border-white/10"
              style={{
                width: `${yorunge.cap}%`,
                height: `${yorunge.cap}%`,
                transform: `rotateX(${EGIM}deg)`,
              }}
            >
              {yorunge.logolar.map((dosya, logoSira) => {
                const aci = yorunge.faz + logoSira * aralik;

                return (
                  <m.div
                    key={dosya}
                    /*
                     * Yüksekliği halkanın yarısı ve dönme ekseni **altta**:
                     * eleman halkanın merkezinden yukarı uzanan bir kol
                     * gibi çalışıyor, ucundaki simge de çember üzerinde
                     * geziyor.
                     */
                    className="yorunge-kol absolute top-0 left-1/2 flex h-1/2 origin-bottom justify-center"
                    initial={{ rotate: aci }}
                    animate={{ rotate: azalt ? aci : aci + yon * 360 }}
                    transition={donus(yorunge.sure)}
                  >
                    <m.span
                      className="yorunge-simge -mt-6 grid h-12 w-12 place-items-center rounded-full"
                      // Yatırmayı geri alıyor; dönüşten **sonra** uygulanıyor.
                      style={{ rotateX: -EGIM }}
                      initial={{ rotate: -aci }}
                      animate={{ rotate: azalt ? -aci : -aci - yon * 360 }}
                      transition={donus(yorunge.sure)}
                    >
                      <img
                        src={`/logolar/${dosya}.png`}
                        alt={okunabilirAd(dosya)}
                        width={28}
                        height={28}
                        className="yorunge-logo h-7 w-7 object-contain"
                      />
                    </m.span>
                  </m.div>
                );
              })}
            </div>
          );
        })}
      </m.div>
    </LazyMotion>
  );
}
