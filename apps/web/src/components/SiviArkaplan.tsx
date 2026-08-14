import { useEffect, useRef, useState } from 'react';
import {
  SIVI_KOSE_GOLGELEYICI,
  SIVI_PARCA_GOLGELEYICI,
} from '../lib/sivi-golgeleyici';
import { SAHNE } from '../sahne/yapilandirma';

/**
 * Uygulamanın her ekranındaki sıvı metal arka planı.
 *
 * Hikâye sayfasındaki sahneyle **aynı** gölgelendirici; oradan buraya
 * geçerken arka plan değişmiyor.
 *
 * ## Neden three.js değil ham WebGL
 *
 * Burada çizilen şey tek bir tam ekran dikdörtgen ve tek bir parça
 * gölgelendiricisi. three.js sahne grafiği, kamera, malzeme sistemi
 * getiriyor — hiçbiri kullanılmıyor ve indirilen dosyaya 138 kB ekliyor.
 * Ham WebGL'de aynı görüntü yüz satır ve sıfır bağımlılık. three.js
 * yalnızca hikâye sayfasında, orada gerçekten 3B bir sahne var.
 *
 * ## Başarısız olursa
 *
 * WebGL yoksa (eski cihaz, kapalı donanım hızlandırma, sanal makine) tuval
 * gizleniyor ve altındaki CSS geçişleri görünüyor. Arka plan bir süs;
 * uygulamanın çalışmasını buna bağlamak yanlış olurdu.
 */
export function SiviArkaplan() {
  const tuvalRef = useRef<HTMLCanvasElement>(null);
  const [calisiyor, setCalisiyor] = useState(true);

  useEffect(() => {
    const tuval = tuvalRef.current;
    if (tuval === null) {
      return;
    }

    const gl = tuval.getContext('webgl', {
      antialias: false,
      alpha: false,
      powerPreference: 'low-power',
    });
    if (gl === null) {
      setCalisiyor(false);
      return;
    }

    const derle = (tur: number, kaynak: string) => {
      const golgeleyici = gl.createShader(tur);
      if (golgeleyici === null) {
        return null;
      }
      gl.shaderSource(golgeleyici, kaynak);
      gl.compileShader(golgeleyici);
      if (gl.getShaderParameter(golgeleyici, gl.COMPILE_STATUS) !== true) {
        console.warn('Gölgelendirici derlenmedi', gl.getShaderInfoLog(golgeleyici));
        return null;
      }
      return golgeleyici;
    };

    const kose = derle(gl.VERTEX_SHADER, SIVI_KOSE_GOLGELEYICI);
    const parca = derle(gl.FRAGMENT_SHADER, SIVI_PARCA_GOLGELEYICI);
    const program = gl.createProgram();
    if (kose === null || parca === null || program === null) {
      setCalisiyor(false);
      return;
    }
    gl.attachShader(program, kose);
    gl.attachShader(program, parca);
    gl.linkProgram(program);
    if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
      console.warn('Program bağlanmadı', gl.getProgramInfoLog(program));
      setCalisiyor(false);
      return;
    }
    gl.useProgram(program);

    // Tam ekranı kaplayan iki üçgen.
    const tampon = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, tampon);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const konum = gl.getAttribLocation(program, 'konum');
    gl.enableVertexAttribArray(konum);
    gl.vertexAttribPointer(konum, 2, gl.FLOAT, false, 0, 0);

    const yer = (ad: string) => gl.getUniformLocation(program, ad);
    const uZaman = yer('uZaman');
    const uIlerleme = yer('uIlerleme');
    const uImlec = yer('uImlec');
    const uOlcu = yer('uOlcu');

    const { bronz, safir } = SAHNE.renkler;
    gl.uniform3fv(yer('uGolgeA'), bronz.golge);
    gl.uniform3fv(yer('uDalgaA'), bronz.dalga);
    gl.uniform3fv(yer('uIsikA'), bronz.isik);
    gl.uniform3fv(yer('uYansimaA'), bronz.yansima);
    gl.uniform3fv(yer('uGolgeB'), safir.golge);
    gl.uniform3fv(yer('uDalgaB'), safir.dalga);
    gl.uniform3fv(yer('uIsikB'), safir.isik);
    gl.uniform3fv(yer('uYansimaB'), safir.yansima);

    /*
     * Uygulama ekranlarında renk kaydırmaya bağlı değil, sabit: bronzdan
     * safire doğru dörtte bir yol. Hikâyedeki yolculuğun ortasında bir
     * yerde durmak, iki ekran arasında geçerken sıçrama hissi vermiyor.
     */
    gl.uniform1f(uIlerleme, 0.26);

    const azalt =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

    const imlec = { x: 0, y: 0 };
    const hedefImlec = { x: 0, y: 0 };
    const imlecDinle = (olay: PointerEvent) => {
      hedefImlec.x = (olay.clientX / window.innerWidth) * 2 - 1;
      hedefImlec.y = (olay.clientY / window.innerHeight) * 2 - 1;
    };

    const olcekle = () => {
      /*
       * Arka plan yumuşak ve bulanık; tam çözünürlükte çizmek boşa
       * hesaplama. Yarım çözünürlük gözle ayırt edilmiyor ama parça
       * gölgelendiricisinin işini dörtte bire indiriyor.
       */
      const yogunluk = Math.min(window.devicePixelRatio, 2) * 0.5;
      tuval.width = Math.round(window.innerWidth * yogunluk);
      tuval.height = Math.round(window.innerHeight * yogunluk);
      gl.viewport(0, 0, tuval.width, tuval.height);
      gl.uniform2f(uOlcu, tuval.width, tuval.height);
    };
    olcekle();
    window.addEventListener('resize', olcekle);
    window.addEventListener('pointermove', imlecDinle, { passive: true });

    let cerceve = 0;
    const ciz = (msZaman: number) => {
      cerceve = requestAnimationFrame(ciz);
      imlec.x += (hedefImlec.x - imlec.x) * 0.04;
      imlec.y += (hedefImlec.y - imlec.y) * 0.04;
      // Hareket azaltıldığında desen duruyor ama kaybolmuyor.
      gl.uniform1f(uZaman, azalt ? 0 : msZaman / 1000);
      gl.uniform2f(uImlec, imlec.x, imlec.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    cerceve = requestAnimationFrame(ciz);

    return () => {
      cancelAnimationFrame(cerceve);
      window.removeEventListener('resize', olcekle);
      window.removeEventListener('pointermove', imlecDinle);
      gl.deleteBuffer(tampon);
      gl.deleteProgram(program);
      gl.deleteShader(kose);
      gl.deleteShader(parca);
    };
  }, []);

  return (
    <div className="tema-arkaplan" aria-hidden>
      <canvas
        ref={tuvalRef}
        className={calisiyor ? 'tema-tuval' : 'tema-tuval tema-tuval-yok'}
      />
    </div>
  );
}
