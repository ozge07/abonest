import { useEffect, useRef, useState } from 'react';
import { SAHNE, type Bolum } from './yapilandirma';
import { Yuva } from './Yuva';

/**
 * Sahnenin üstündeki arayüz katmanları: ızgara, başlık, bölüm yazıları,
 * ilerleme çizgisi ve imleç.
 *
 * Hepsi `pointer-events: none` — tıklanabilir olanlar (gezinme, düğme)
 * tek tek geri açılıyor. Aksi hâlde tam ekran katmanlar altındaki forma
 * tıklamayı engelliyordu.
 */

/* ==========================================================================
   Izgara
   ========================================================================== */

/**
 * Mimari ızgara: başlığın altında bir yatay çizgi, beş dikey çizgi.
 *
 * Dar ekranda dikey çizgi sayısı üçe iniyor; beş çizgi 390 pikselde
 * ekranı kafes gibi gösteriyordu.
 */
export function Izgara({
  dar,
  arkada = false,
}: {
  dar: boolean;
  /**
   * Izgara içeriğin arkasında kalsın.
   *
   * Hikâyede ızgara yazının **üstünde**: sergi camının ardından bakma
   * hissini o veriyor. Uygulamada aynısı yapıldığında abonelik listesi
   * çizgili görünüyordu — satırların üstünden geçen dikey çizgiler tabloyu
   * kirletiyor. Orada ızgara bir doku, içeriğin önünde durmamalı.
   */
  arkada?: boolean;
}) {
  const dikeyler = dar ? [0.5, 0.5 + 0.25, 0.25] : [0.16, 0.33, 0.5, 0.66, 0.84];

  return (
    <div
      className={arkada ? 'sahne-katman sahne-katman-arkada' : 'sahne-katman'}
      aria-hidden
    >
      <div className="sahne-izgara-yatay" />
      {dikeyler.map((oran, i) => (
        <div
          key={oran}
          className="sahne-izgara-dikey"
          style={{ left: `${oran * 100}%` }}
        >
          {/*
            Çizgi üzerinde gezinen nokta. Her çizgide farklı hız ve yön:
            aynı ritimde olsalardı ızgara bir asansör panosuna benzerdi.
          */}
          <span
            className="sahne-izgara-nokta"
            style={{
              animationDuration: `${9 + i * 3.5}s`,
              animationDirection: i % 2 === 0 ? 'normal' : 'reverse',
              animationDelay: `${-i * 2.2}s`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

/* ==========================================================================
   Başlık
   ========================================================================== */

export function Baslik({
  dar,
  etkinBolum,
  bolumeGit,
}: {
  dar: boolean;
  etkinBolum: number;
  bolumeGit: (sira: number) => void;
}) {
  return (
    <header className="sahne-baslik">
      <span className="sahne-marka">{SAHNE.marka}</span>

      {/* Dar ekranda gezinme gizleniyor; marka ve düğme kalıyor. */}
      {!dar && (
        <nav className="sahne-gezinme">
          {SAHNE.bolumler.map((bolum, i) => (
            <span key={bolum.kimlik} className="sahne-gezinme-oge">
              {i > 0 && <span className="sahne-ayrac" aria-hidden />}
              <button
                type="button"
                onClick={() => bolumeGit(i)}
                aria-current={etkinBolum === i ? 'true' : undefined}
                className={etkinBolum === i ? 'sahne-bag sahne-bag-etkin' : 'sahne-bag'}
              >
                {bolum.kisaAd}
              </button>
            </span>
          ))}
        </nav>
      )}

      {/*
        Sağ üstte bir düğme yok.
        
        Önce "Uygulamaya gir" yazan bir hap vardı ama sayfa içindeki
        panele kaydırmaktan başka bir şey yapmıyordu — kullanıcıya iş
        yapacakmış gibi görünüp yapmayan bir düğme. Uygulamaya geçiş
        sağdaki panelde, orada gerçekten uygulamayı açıyor.
      */}
      <span className="sahne-baslik-bosluk" aria-hidden />
    </header>
  );
}

/* ==========================================================================
   Bölüm yazıları
   ========================================================================== */

/**
 * Başlığı harf harf canlandırıyor.
 *
 * Her harf ayrı bir `<span>`: 50 piksel aşağıdan, bulanık ve saydam
 * başlayıp yukarı doğru netleşerek beliriyor. Gecikme harf sırasına göre
 * artıyor.
 *
 * Boşluklar `&nbsp;` ile korunuyor — `inline-block` bir `<span>` içindeki
 * sıradan boşluk çizilmiyor ve kelimeler birbirine giriyordu.
 */
export function HarfHarf({
  metin,
  gecikme,
  azalt,
}: {
  metin: string;
  gecikme: number;
  azalt: boolean;
}) {
  return (
    <span className="sahne-satir">
      {[...metin].map((harf, i) => (
        <span
          key={`${harf}-${String(i)}`}
          className="sahne-harf"
          style={{
            animationDelay: azalt ? '0s' : `${gecikme + i * 0.035}s`,
          }}
        >
          {harf === ' ' ? ' ' : harf}
        </span>
      ))}
    </span>
  );
}

export function Bolumler({
  etkinBolum,
  azalt,
  dar,
}: {
  etkinBolum: number;
  azalt: boolean;
  dar: boolean;
}) {
  return (
    <div className="sahne-katman" aria-live="polite">
      {!dar &&
        SAHNE.bolumler.map((bolum, i) =>
          bolum.logoDuvari === undefined ? null : (
            <Yuva
              key={`yuva-${bolum.kimlik}`}
              logolar={bolum.logoDuvari}
              etkinBolum={etkinBolum}
              bolumSirasi={i}
              azalt={azalt}
            />
          ),
        )}

      {SAHNE.bolumler.map((bolum: Bolum, i) => {
        const etkin = i === etkinBolum;
        return (
          <section
            key={bolum.kimlik}
            id={bolum.kimlik}
            /*
             * Etkin olmayan bölüm `display: none` ile tamamen kalkıyor.
             * Yalnızca saydamlığı sıfırlamak yetmiyordu: iki bölümün
             * yazısı üst üste biniyor ve harfler birbirinin arasından
             * görünüyordu.
             */
            className={[
              'sahne-bolum',
              `sahne-bolum-${bolum.yerlesim}`,
              etkin ? 'sahne-bolum-etkin' : '',
            ].join(' ')}
            aria-hidden={!etkin}
          >
            {/*
              Yuva bölümün **içinde** çizilmiyor: etkin olmayan bölüm
              `display: none` ile kalkıyor ve kuş uçarak ayrılamazdı.
              Kendi katmanında, kendi aşamalarını yönetiyor.
            */}

            <h2 className="sahne-baslik-metni">
              {/*
                `key` aşamayla değişiyor: bölüm yeniden etkin olduğunda
                React eski düğümleri koruyup animasyonu tekrar
                oynatmıyordu.
              */}
              <HarfHarf
                key={`${bolum.kimlik}-1-${String(etkin)}`}
                metin={bolum.baslik[0]}
                gecikme={0.05}
                azalt={azalt}
              />
              <HarfHarf
                key={`${bolum.kimlik}-2-${String(etkin)}`}
                metin={bolum.baslik[1]}
                gecikme={0.05 + bolum.baslik[0].length * 0.035}
                azalt={azalt}
              />
            </h2>

            <div className="sahne-paragraflar">
              {bolum.paragraflar.map((p, pi) => (
                <p
                  key={p.slice(0, 24)}
                  className={
                    // Dar ekranda açılış bölümünün ikinci paragrafı
                    // gizleniyor; yer yok ve ilk paragraf yeterli.
                    pi === 1 ? 'sahne-paragraf sahne-paragraf-ikincil' : 'sahne-paragraf'
                  }
                  style={{ animationDelay: azalt ? '0s' : `${0.55 + pi * 0.12}s` }}
                >
                  {p}
                </p>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ==========================================================================
   İlerleme
   ========================================================================== */

/**
 * En sağdaki dikey ızgara çizgisi üzerinde dört kısa çizgi.
 *
 * Her çizgi bir bölüm. Toplam ilerlemeye göre yukarıdan aşağı doluyorlar;
 * birincisi tamamlanmadan ikincisi başlamıyor.
 */
export function Ilerleme({ ilerleme }: { ilerleme: number }) {
  const adet = SAHNE.bolumler.length;
  return (
    <div className="sahne-ilerleme" aria-hidden>
      {SAHNE.bolumler.map((bolum, i) => {
        const pay = Math.min(1, Math.max(0, ilerleme * adet - i));
        return (
          <span key={bolum.kimlik} className="sahne-cizik">
            <span className="sahne-cizik-dolu" style={{ height: `${pay * 100}%` }} />
          </span>
        );
      })}
    </div>
  );
}

/* ==========================================================================
   İmleç
   ========================================================================== */

/**
 * Keskin bir nokta ve onu gecikmeyle takip eden halka.
 *
 * Dokunmatik cihazda hiç çizilmiyor: orada imleç diye bir şey yok ve
 * ekranda takılı kalan bir halka kalırdı.
 */
export function Imlec() {
  const noktaRef = useRef<HTMLDivElement>(null);
  const halkaRef = useRef<HTMLDivElement>(null);
  const [gorunur, setGorunur] = useState(false);

  useEffect(() => {
    const dokunmatik = window.matchMedia('(hover: none)').matches;
    if (dokunmatik) {
      return;
    }
    setGorunur(true);

    let hedefX = window.innerWidth / 2;
    let hedefY = window.innerHeight / 2;
    let halkaX = hedefX;
    let halkaY = hedefY;
    let cerceve = 0;

    const kipir = (olay: PointerEvent) => {
      hedefX = olay.clientX;
      hedefY = olay.clientY;
      const uzerinde =
        olay.target instanceof Element &&
        olay.target.closest('a, button, input, [role="button"]') !== null;
      halkaRef.current?.classList.toggle('sahne-halka-buyuk', uzerinde);
    };

    const dongu = () => {
      cerceve = requestAnimationFrame(dongu);
      // Halka gecikmeli takip ediyor; nokta anında.
      halkaX += (hedefX - halkaX) * 0.16;
      halkaY += (hedefY - halkaY) * 0.16;
      if (noktaRef.current !== null) {
        noktaRef.current.style.transform = `translate3d(${String(hedefX)}px, ${String(hedefY)}px, 0)`;
      }
      if (halkaRef.current !== null) {
        halkaRef.current.style.transform = `translate3d(${String(halkaX)}px, ${String(halkaY)}px, 0)`;
      }
    };

    window.addEventListener('pointermove', kipir);
    cerceve = requestAnimationFrame(dongu);
    return () => {
      window.removeEventListener('pointermove', kipir);
      cancelAnimationFrame(cerceve);
    };
  }, []);

  if (!gorunur) {
    return null;
  }

  return (
    <>
      <div ref={noktaRef} className="sahne-nokta" aria-hidden />
      <div ref={halkaRef} className="sahne-halka" aria-hidden />
    </>
  );
}
