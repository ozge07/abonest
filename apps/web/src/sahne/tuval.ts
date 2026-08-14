/**
 * Sinematik sahnenin WebGL tarafı.
 *
 * React'ten bağımsız, düz bir kurulum fonksiyonu: bir `<canvas>` alıyor,
 * sahneyi kuruyor ve `serbestBirak()` döndürüyor. Böylece her karede React
 * yeniden çizim yapmıyor — yalnızca `requestAnimationFrame` döngüsü
 * çalışıyor.
 *
 * ## Katmanlar
 *
 * 1. Sıvı metal arka planı — ayrı bir ortografik sahne, önce çiziliyor.
 * 2. Yumurta ve yörünge diskleri — perspektif kamera bunların çevresinde
 *    tam bir tur atıyor.
 * 3. Kıvılcımlar — toplamsal karışımla çizilen noktalar.
 *
 * Arka plan ayrı sahnede çünkü perspektif kamera dönerken dünya
 * koordinatındaki bir düzlem de onunla kayardı. Ortografik sahne kameradan
 * bağımsız: ekranı her zaman tam kaplıyor.
 */

import {
  AdditiveBlending,
  ACESFilmicToneMapping,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PMREMGenerator,
  PointsMaterial,
  Points,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  SpotLight,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SAHNE } from './yapilandirma';
import { YUMURTA_YUKSEKLIK, yumurtaYaricapi } from '../lib/yumurta';
import { SIVI_PARCA_GOLGELEYICI } from '../lib/sivi-golgeleyici';

/** Dışarıdan her karede güncellenen girdiler. */
export interface SahneGirdisi {
  /** 0–1 arası kaydırma ilerlemesi. */
  ilerleme: number;
  /** Son karedeki kaydırma hızı; kıvılcımları canlandırıyor. */
  hiz: number;
  /** İmleç konumu, -1 … 1 aralığında. */
  imlec: { x: number; y: number };
}

export interface SahneTutamagi {
  guncelle: (girdi: SahneGirdisi) => void;
  serbestBirak: () => void;
}

/**
 * Yumurta profili: dönel yüzey için yarım kesit.
 *
 * Şekil `lib/yumurta.ts` içinde — giriş ekranındaki parçacık yumurtası da
 * aynı bağıntıyı kullanıyor. İkisi ayrı yazılsaydı biri değiştiğinde
 * diğeri sessizce başka bir yumurta olurdu.
 */
function yumurtaProfili(): Vector2[] {
  const noktalar: Vector2[] = [];
  const ADIM = 64;
  for (let i = 0; i <= ADIM; i++) {
    const aci = (i / ADIM) * Math.PI;
    noktalar.push(
      new Vector2(
        Math.max(yumurtaYaricapi(aci), 0.0001),
        Math.cos(aci) * YUMURTA_YUKSEKLIK,
      ),
    );
  }
  return noktalar;
}

/** Kıvılcımların yumuşak parlaklığı — tek bir radyal geçiş dokusu. */
function kivilcimDokusu(): Texture {
  const boyut = 64;
  const tuval = document.createElement('canvas');
  tuval.width = boyut;
  tuval.height = boyut;
  const ctx = tuval.getContext('2d');
  if (ctx !== null) {
    const gecis = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gecis.addColorStop(0, 'rgba(255,255,255,1)');
    gecis.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    gecis.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gecis;
    ctx.fillRect(0, 0, boyut, boyut);
  }
  return new CanvasTexture(tuval);
}

/**
 * Logoyu parlak bir disk üzerine yerleştiren doku.
 *
 * Logo tek başına bir kare resim olarak dönseydi uzayda asılı bir çıkartma
 * gibi görünürdü. Disk ona hacim veriyor: üstten ışık, altta gölge.
 */
function diskDokusu(logo: HTMLImageElement): Texture {
  const boyut = 256;
  const tuval = document.createElement('canvas');
  tuval.width = boyut;
  tuval.height = boyut;
  const ctx = tuval.getContext('2d');
  if (ctx === null) {
    return new CanvasTexture(tuval);
  }

  const merkez = boyut / 2;
  const yaricap = merkez - 8;

  ctx.save();
  ctx.beginPath();
  ctx.arc(merkez, merkez, yaricap, 0, Math.PI * 2);
  ctx.clip();

  const yuzey = ctx.createRadialGradient(
    merkez - yaricap * 0.35,
    merkez - yaricap * 0.4,
    yaricap * 0.1,
    merkez,
    merkez,
    yaricap,
  );
  yuzey.addColorStop(0, '#3a404b');
  yuzey.addColorStop(0.55, '#1b1f27');
  yuzey.addColorStop(1, '#0d0f14');
  ctx.fillStyle = yuzey;
  ctx.fillRect(0, 0, boyut, boyut);

  const oran = Math.min(1, 118 / Math.max(logo.width, logo.height));
  const g = logo.width * oran;
  const y = logo.height * oran;
  ctx.drawImage(logo, merkez - g / 2, merkez - y / 2, g, y);
  ctx.restore();

  // Kenar ışığı: diskin kalınlığını hissettiriyor.
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(merkez, merkez, yaricap, 0, Math.PI * 2);
  ctx.stroke();

  const doku = new CanvasTexture(tuval);
  doku.colorSpace = SRGBColorSpace;
  return doku;
}

/*
 * Arka plan gölgelendiricisi `lib/sivi-golgeleyici.ts` içinde: uygulamanın
 * her ekranındaki hafif arka plan da aynısını kullanıyor. Köşe
 * gölgelendiricisi burada ayrı, çünkü three.js kendi `position`
 * niteliğini veriyor; ham WebGL tarafında nitelik adı `konum`.
 */
const ARKA_PLAN_KOSE = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export function sahneKur(
  tuval: HTMLCanvasElement,
  secenekler: { azalt: boolean; dar: boolean },
): SahneTutamagi {
  const cizici = new WebGLRenderer({
    canvas: tuval,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  cizici.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  cizici.setSize(window.innerWidth, window.innerHeight);
  cizici.toneMapping = ACESFilmicToneMapping;
  cizici.toneMappingExposure = 1.15;
  cizici.outputColorSpace = SRGBColorSpace;
  cizici.shadowMap.enabled = true;
  /*
   * İki sahne üst üste çiziliyor, bu yüzden otomatik temizleme kapalı:
   * ikinci çizim birincinin rengini silmemeli, yalnızca derinliği
   * sıfırlanmalı.
   */
  cizici.autoClear = false;

  // --- Arka plan sahnesi ---

  const arkaSahne = new Scene();
  const arkaKamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const { bronz, safir } = SAHNE.renkler;
  const arkaMalzeme = new ShaderMaterial({
    vertexShader: ARKA_PLAN_KOSE,
    fragmentShader: SIVI_PARCA_GOLGELEYICI,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uZaman: { value: 0 },
      uIlerleme: { value: 0 },
      uImlec: { value: new Vector2() },
      uOlcu: { value: new Vector2(window.innerWidth, window.innerHeight) },
      uGolgeA: { value: new Vector3(...bronz.golge) },
      uDalgaA: { value: new Vector3(...bronz.dalga) },
      uIsikA: { value: new Vector3(...bronz.isik) },
      uYansimaA: { value: new Vector3(...bronz.yansima) },
      uGolgeB: { value: new Vector3(...safir.golge) },
      uDalgaB: { value: new Vector3(...safir.dalga) },
      uIsikB: { value: new Vector3(...safir.isik) },
      uYansimaB: { value: new Vector3(...safir.yansima) },
    },
  });
  arkaSahne.add(new Mesh(new PlaneGeometry(2, 2), arkaMalzeme));

  // --- Ana sahne ---

  const sahne = new Scene();
  sahne.fog = new FogExp2(0x07080b, 0.055);

  /*
   * Dar ekranda görüş açısı geniş, yörünge dar.
   *
   * Perspektif kameranın **dikey** açısı sabit; yataydaki ondan ve
   * en-boy oranından türüyor. Dikey telefon ekranında oran 0.46'ya
   * düşüyor ve yatayda görülebilen alan ±0.83 birime iniyordu — yörünge
   * yarıçapı 2.3–3.5 olduğu için diskler kadraja **matematiksel olarak**
   * giremiyordu. Telefonda ölçüldü: on iki diskten hiçbiri görünmüyordu.
   *
   * Kamerayı geriye çekmek çözmüyor: yarıçapı sığdıracak uzaklıkta
   * yumurta nokta kadar kalıyor. Çözüm ikisini birlikte değiştirmek —
   * açıyı genişletmek ve yörüngeyi yumurtanın etrafına toplamak.
   */
  const dar = secenekler.dar;
  const kamera = new PerspectiveCamera(
    dar ? 52 : 38,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );

  /*
   * Ortam haritası olmadan metal siyah görünür: `metalness: 0.9` demek
   * "rengimi çevremden al" demek, çevre yoksa alacak bir şey yok.
   * `RoomEnvironment` three ile birlikte geliyor, dışarıdan dosya
   * indirmiyor — bu projenin içerik güvenlik politikası zaten dış istek
   * yapmıyor.
   */
  const pmrem = new PMREMGenerator(cizici);
  const ortam = pmrem.fromScene(new RoomEnvironment(), 0.04);
  sahne.environment = ortam.texture;

  const yumurta = new Mesh(
    new LatheGeometry(yumurtaProfili(), 96),
    new MeshStandardMaterial({
      color: new Color('#c98a4b'),
      metalness: 0.9,
      roughness: 0.4,
      envMapIntensity: 1.1,
    }),
  );
  yumurta.castShadow = true;
  yumurta.scale.setScalar(0.6);
  // Biraz yukarıda: sol alttaki bölüm yazısına yer bırakıyor.
  yumurta.position.y = 0.35;
  const yumurtaGrubu = new Group();
  yumurtaGrubu.add(yumurta);
  sahne.add(yumurtaGrubu);

  // Işıklar: tepeden sağdan güçlü beyaz, soğuk kenar, sıcak dolgu.
  const tepe = new SpotLight(0xffffff, 90, 22, Math.PI / 6, 0.45, 1.6);
  tepe.position.set(4.2, 6.4, 3.2);
  tepe.castShadow = true;
  tepe.shadow.mapSize.set(1024, 1024);
  tepe.shadow.bias = -0.0015;
  sahne.add(tepe, tepe.target);

  const kenar = new DirectionalLight(0x7fb4ff, 1.5);
  kenar.position.set(-4, 1.4, -3.4);
  sahne.add(kenar);

  const dolgu = new DirectionalLight(0xffb072, 0.75);
  dolgu.position.set(2.4, -1.2, 2.8);
  sahne.add(dolgu);

  // --- Yörüngedeki servis diskleri ---

  const yorunge = new Group();
  sahne.add(yorunge);
  const diskler: { sprite: Sprite; yaricap: number; hiz: number; faz: number; yukseklik: number }[] =
    [];

  const yukleyici = new TextureLoader();
  SAHNE.yorungeLogolari.forEach((dosya, i) => {
    const gorsel = new Image();
    gorsel.crossOrigin = 'anonymous';
    gorsel.src = `/logolar/${dosya}.png`;
    gorsel.onload = () => {
      const sprite = new Sprite(
        new SpriteMaterial({
          map: diskDokusu(gorsel),
          transparent: true,
          depthWrite: false,
          fog: false,
        }),
      );
      sprite.scale.setScalar(dar ? 0.15 : 0.2);
      yorunge.add(sprite);
      diskler.push({
        sprite,
        /*
         * Geniş yarıçaplar: diskler daha küçük ve daha dışarıda.
         * Önce 1,5–2,6 aralığındaydı ve yumurtanın üstüne biniyorlardı;
         * ekran görüntüsünde YouTube diski yumurtayı örtüyordu.
         */
        // Dar ekranda yörünge yumurtanın çevresine toplanıyor.
        yaricap: (2.3 + (i % 3) * 0.62) * (dar ? 0.36 : 1),
        hiz: (i % 3 === 1 ? -1 : 1) * (0.16 - (i % 3) * 0.035),
        faz: (i / SAHNE.yorungeLogolari.length) * Math.PI * 2,
        yukseklik: ((i % 5) - 2) * (dar ? 0.16 : 0.3),
      });
    };
  });
  void yukleyici;

  // --- Kıvılcımlar ---

  const KIVILCIM = 430;
  const konumlar = new Float32Array(KIVILCIM * 3);
  const renkler = new Float32Array(KIVILCIM * 3);
  const hizlar = new Float32Array(KIVILCIM * 3);
  const sicak = new Color('#ffb257');
  const soguk = new Color('#9ec9ff');

  const kivilcimYerlestir = (i: number, ilkKurulum: boolean) => {
    konumlar[i * 3] = (Math.random() - 0.5) * 9;
    konumlar[i * 3 + 1] = ilkKurulum ? (Math.random() - 0.5) * 7 : -3.6;
    konumlar[i * 3 + 2] = (Math.random() - 0.5) * 9;
    hizlar[i * 3] = (Math.random() - 0.5) * 0.004;
    hizlar[i * 3 + 1] = 0.004 + Math.random() * 0.009;
    hizlar[i * 3 + 2] = (Math.random() - 0.5) * 0.004;
  };

  for (let i = 0; i < KIVILCIM; i++) {
    kivilcimYerlestir(i, true);
    const renk = Math.random() < 0.62 ? sicak : soguk;
    // Bir kısmı beyaza yakın: göz onları "çekirdek" olarak okuyor.
    const beyazlik = Math.random() < 0.22 ? 0.6 : 0;
    renkler[i * 3] = renk.r + (1 - renk.r) * beyazlik;
    renkler[i * 3 + 1] = renk.g + (1 - renk.g) * beyazlik;
    renkler[i * 3 + 2] = renk.b + (1 - renk.b) * beyazlik;
  }

  const kivilcimGeo = new BufferGeometry();
  kivilcimGeo.setAttribute('position', new BufferAttribute(konumlar, 3));
  kivilcimGeo.setAttribute('color', new BufferAttribute(renkler, 3));
  const kivilcimlar = new Points(
    kivilcimGeo,
    new PointsMaterial({
      size: 0.085,
      map: kivilcimDokusu(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
      sizeAttenuation: true,
    }),
  );
  sahne.add(kivilcimlar);

  // --- Döngü ---

  const girdi: SahneGirdisi = { ilerleme: 0, hiz: 0, imlec: { x: 0, y: 0 } };
  // Yumuşatılmış değerler: ham girdi doğrudan uygulanırsa hareket
  // imlece yapışık ve ucuz görünüyor.
  let yIlerleme = 0;
  let yHiz = 0;
  const yImlec = { x: 0, y: 0 };
  let acilma = 0;
  let cerceve = 0;
  let bitti = false;
  const bak = new Vector3();

  const olcuGuncelle = () => {
    const g = window.innerWidth;
    const y = window.innerHeight;
    cizici.setSize(g, y);
    cizici.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    kamera.aspect = g / y;
    kamera.updateProjectionMatrix();
    arkaMalzeme.uniforms['uOlcu']!.value.set(g, y);
  };
  window.addEventListener('resize', olcuGuncelle);

  const dongu = (zamanMs: number) => {
    if (bitti) {
      return;
    }
    cerceve = requestAnimationFrame(dongu);
    const t = zamanMs / 1000;

    // Ağır ve gecikmeli takip: kaydırma dursa bile hareket bir süre sürüyor.
    yIlerleme += (girdi.ilerleme - yIlerleme) * 0.055;
    yHiz += (girdi.hiz - yHiz) * 0.08;
    yImlec.x += (girdi.imlec.x - yImlec.x) * 0.045;
    yImlec.y += (girdi.imlec.y - yImlec.y) * 0.045;
    acilma = Math.min(1, acilma + 0.012);

    // Kamera: tam tur, ortada biraz yükselip yaklaşıyor.
    const aci = -Math.PI * 0.12 + yIlerleme * Math.PI * 2;
    const orta = Math.sin(yIlerleme * Math.PI);

    // Dar ekranda biraz daha geride: geniş açı yakın planda bozuyor.
    const uzaklik = (5.2 - orta * 0.9) * (dar ? 1.25 : 1);
    kamera.position.set(
      Math.sin(aci) * uzaklik,
      0.35 + orta * 1.15,
      Math.cos(aci) * uzaklik,
    );
    // Açılış bölümünde bakış biraz kaykılıyor, sonra ortalanıyor.
    const kayma = (1 - Math.min(1, yIlerleme / 0.25)) * 0.55;
    bak.set(kayma, 0.45 - kayma * 0.2, 0);
    kamera.lookAt(bak);
    /*
     * Yumurta ekranın ortasında kalıyor: solda bölüm yazısı, sağda giriş
     * formu, arada o. Bir ara kamerayı sağa kaydırıp yumurtayı sola
     * taşımıştım — sağdaki formu diskler kaplamasın diye. Ama o zaman
     * yumurta bölüm başlığının altına giriyordu. Asıl sorun diskler
     * kadar büyük ve formun saydam olmasıydı; ikisi de çözülünce
     * kaydırmaya gerek kalmadı.
     *
     * Küçük bir sağa kaydırma yine de var: bölüm yazıları soldaki bantta
     * duruyor, yumurta o banttan tamamen çıksın diye.
     */
    kamera.translateX(secenekler.dar ? 0 : -0.45);

    // Yumurta imlece ağır ağır tepki veriyor.
    const tepki = secenekler.azalt ? 0.25 : 1;
    yumurtaGrubu.rotation.y = yImlec.x * 0.45 * tepki + t * 0.05;
    yumurtaGrubu.rotation.x = yImlec.y * 0.18 * tepki;
    yumurta.scale.setScalar(0.6 * (0.82 + acilma * 0.18));
    (yumurta.material as MeshStandardMaterial).opacity = acilma;
    (yumurta.material as MeshStandardMaterial).transparent = acilma < 1;

    for (const d of diskler) {
      const a = d.faz + t * d.hiz * (secenekler.azalt ? 0 : 1);
      d.sprite.position.set(
        Math.cos(a) * d.yaricap,
        d.yukseklik + Math.sin(t * 0.35 + d.faz) * 0.08,
        Math.sin(a) * d.yaricap,
      );
      d.sprite.material.opacity = acilma;
    }

    // Kıvılcımlar: yükseliyor, savruluyor, ekrandan çıkınca yeniden doğuyor.
    const canlanma = 1 + Math.min(Math.abs(yHiz) * 26, 3.2);
    for (let i = 0; i < KIVILCIM; i++) {
      const k = i * 3;
      konumlar[k]! +=
        (hizlar[k]! + Math.sin(t * 0.6 + i) * 0.0016) * canlanma;
      konumlar[k + 1]! += hizlar[k + 1]! * canlanma;
      konumlar[k + 2]! += hizlar[k + 2]! * canlanma;
      if (konumlar[k + 1]! > 3.8) {
        kivilcimYerlestir(i, false);
      }
    }
    kivilcimGeo.attributes['position']!.needsUpdate = true;

    arkaMalzeme.uniforms['uZaman']!.value = t;
    arkaMalzeme.uniforms['uIlerleme']!.value = yIlerleme;
    arkaMalzeme.uniforms['uImlec']!.value.set(yImlec.x, yImlec.y);

    cizici.clear();
    cizici.render(arkaSahne, arkaKamera);
    cizici.clearDepth();
    cizici.render(sahne, kamera);
  };
  cerceve = requestAnimationFrame(dongu);

  return {
    guncelle: (yeni) => {
      girdi.ilerleme = yeni.ilerleme;
      girdi.hiz = yeni.hiz;
      girdi.imlec = yeni.imlec;
    },
    serbestBirak: () => {
      bitti = true;
      cancelAnimationFrame(cerceve);
      window.removeEventListener('resize', olcuGuncelle);
      ortam.texture.dispose();
      pmrem.dispose();
      sahne.traverse((n) => {
        if (n instanceof Mesh || n instanceof Points || n instanceof Sprite) {
          n.geometry?.dispose?.();
          const mal = n.material;
          if (Array.isArray(mal)) {
            mal.forEach((m) => m.dispose());
          } else {
            mal?.dispose?.();
          }
        }
      });
      arkaMalzeme.dispose();
      cizici.dispose();
    },
  };
}
