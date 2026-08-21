import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Baslik, Bolumler, Ilerleme, Imlec, Izgara } from './Katmanlar';
import { SAHNE } from './yapilandirma';
import { sahneKur, type SahneTutamagi } from './tuval';
import { YorungeHalkalari } from '../components/YorungeHalkalari';

/**
 * Girişten sonra açılan sinematik anlatı.
 *
 * Sayfa 800vh kaydırılıyor; tuval ve arayüz 100vw × 100vh sabit kalıyor.
 * Kaydırma kamerayı yumurtanın çevresinde tam bir tur döndürüyor, arka
 * plan bronzdan safire geçiyor ve dört bölüm sırayla açılıyor.
 *
 * ## Uygulamaya giriş her zaman açık
 *
 * Sağdaki panel sabit ve ilk karede erişilebilir: kimse aboneliklerini
 * görmek için sekiz ekranlık sergiyi gezmek zorunda değil. Sergi, o
 * düğmenin **etrafında** akıyor.
 *
 * ## Neden kabuğun dışında
 *
 * Sahnenin kendi başlığı, kendi ızgarası ve 800vh kaydırması var;
 * uygulamanın sabit başlık şeridiyle üst üste binerdi. Bu yüzden `Kabuk`
 * içinde değil, kendi tam ekran rotasında.
 *
 * ## WebGL yoksa
 *
 * Tuval kurulamazsa siyah zemin üstünde bronz ve mavi radyal ışıklar
 * kalıyor. Bölümler, ızgara ve form aynen çalışıyor — sahne bir süs,
 * giriş ise işin kendisi.
 */
export function Sahne() {
  const tuvalRef = useRef<HTMLCanvasElement>(null);
  const [ilerleme, setIlerleme] = useState(0);
  const [etkin, setEtkin] = useState(0);
  const [webglVar, setWebglVar] = useState(true);
  const [dar, setDar] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768,
  );
  const [azalt] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  /*
   * Kaydırma ve imleç ham hâlleriyle bir ref'te tutuluyor, React durumuna
   * yazılmıyor: her kaydırma pikselinde yeniden çizim yapmak 800vh boyunca
   * kare düşürüyordu. Durum yalnızca **etkin bölüm** değişince
   * güncelleniyor.
   */
  const girdiRef = useRef({ ilerleme: 0, hiz: 0, imlec: { x: 0, y: 0 } });

  useEffect(() => {
    const olcuDinle = () => {
      setDar(window.innerWidth < 768);
    };
    window.addEventListener('resize', olcuDinle);
    return () => {
      window.removeEventListener('resize', olcuDinle);
    };
  }, []);

  useEffect(() => {
    let oncekiIlerleme = 0;

    const kaydir = () => {
      const menzil = document.documentElement.scrollHeight - window.innerHeight;
      const oran = menzil > 0 ? window.scrollY / menzil : 0;
      girdiRef.current.ilerleme = oran;
      girdiRef.current.hiz = oran - oncekiIlerleme;
      oncekiIlerleme = oran;

      setIlerleme(oran);
      setEtkin(
        Math.min(
          SAHNE.bolumler.length - 1,
          Math.floor(oran * SAHNE.bolumler.length),
        ),
      );
    };

    const imlecDinle = (olay: PointerEvent) => {
      girdiRef.current.imlec = {
        x: (olay.clientX / window.innerWidth) * 2 - 1,
        y: (olay.clientY / window.innerHeight) * 2 - 1,
      };
    };

    window.addEventListener('scroll', kaydir, { passive: true });
    window.addEventListener('pointermove', imlecDinle, { passive: true });
    kaydir();
    return () => {
      window.removeEventListener('scroll', kaydir);
      window.removeEventListener('pointermove', imlecDinle);
    };
  }, []);

  useEffect(() => {
    const tuval = tuvalRef.current;
    if (tuval === null) {
      return;
    }

    let tutamak: SahneTutamagi | null = null;
    try {
      tutamak = sahneKur(tuval, { azalt, dar });
    } catch (hata) {
      // WebGL yoksa ya da bağlam alınamazsa sahne çizilmiyor; sayfa çalışıyor.
      console.warn('Sahne kurulamadı, yedek arka plana geçiliyor', hata);
      setWebglVar(false);
      return;
    }

    let cerceve = 0;
    const besle = () => {
      cerceve = requestAnimationFrame(besle);
      tutamak?.guncelle(girdiRef.current);
    };
    cerceve = requestAnimationFrame(besle);

    return () => {
      cancelAnimationFrame(cerceve);
      tutamak?.serbestBirak();
    };
  }, [azalt, dar]);

  const bolumeGit = (sira: number) => {
    const menzil = document.documentElement.scrollHeight - window.innerHeight;
    const hedef = (menzil * (sira + 0.35)) / SAHNE.bolumler.length;
    window.scrollTo({ top: hedef, behavior: azalt ? 'auto' : 'smooth' });
  };

  return (
    <div className="sahne">
      {/* Kaydırma mesafesini üreten boşluk; içeriği yok. */}
      <div
        className="sahne-mesafe"
        style={{ height: `${String(SAHNE.kaydirmaYuksekligi)}vh` }}
        aria-hidden
      />

      <canvas
        ref={tuvalRef}
        className={webglVar ? 'sahne-tuval' : 'sahne-tuval sahne-tuval-yok'}
        aria-hidden
      />
      {!webglVar && <div className="sahne-yedek" aria-hidden />}

      {/*
        Dar ekranda logolar WebGL diskleri yerine giriş ekranının kendi
        halkalarıyla çiziliyor — birebir aynı bileşen, aynı CSS.

        WebGL yörüngesi telefonda üç kez düzeltilmeye çalışıldı ve üçünde de
        "logolar kaymış" olarak geri geldi: disklerin ekranda nereye
        düşeceği görüş açısına, en-boy oranına ve cihazın piksel oranına
        bağlı, doğrulaması da ancak simülasyonla yapılabiliyor. Eşmerkezli
        CSS halkaları ise ortak bir merkezin etrafında kurulum gereği
        duruyor; yumurtayla hizası da hesaba değil, iki tarafın da ekranın
        tam ortasına bağlanmasına dayanıyor (`tuval.ts` içinde kamera
        yumurtanın merkezine bakıyor).

        Yumurta kapalı: o WebGL'de, metal kabuk olarak duruyor.
      */}
      {dar && (
        <div className="sahne-yorunge" aria-hidden>
          <YorungeHalkalari yumurta={false} />
        </div>
      )}

      <Izgara dar={dar} />
      <Baslik dar={dar} etkinBolum={etkin} bolumeGit={bolumeGit} />
      <Bolumler etkinBolum={etkin} azalt={azalt} dar={dar} />
      <Ilerleme ilerleme={ilerleme} />
      <Imlec />

      {/*
        Uygulamaya giriş: sabit, her zaman görünür. Bölüm yazıları solda
        akarken bu sağda duruyor.
      */}
      <div className="sahne-form" id="uygulamaya-gir">
        <div className="cam-opak flex flex-col gap-4 rounded-2xl p-6">
          <h2 className="sahne-form-baslik">Aboneliklerin hazır</h2>
          <p className="text-sm text-slate-400">
            Sergiyi gezmek istemiyorsan doğrudan uygulamaya geçebilirsin.
          </p>
          {/*
            Başlıktaki hap da "Uygulamaya gir" diyordu ve ikisi aynı ada
            sahip iki bağlantı oluyordu — hem ekran okuyucuda hem testte
            ayırt edilemez. Hap bu panele kaydırıyor, buradaki düğme
            uygulamayı açıyor; adları da bunu söylüyor.
          */}
          <Link to="/abonelikler" className="sahne-gir-dugmesi">
            Aboneliklerime git
          </Link>
        </div>
      </div>
    </div>
  );
}
