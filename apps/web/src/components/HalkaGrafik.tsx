/**
 * Halka grafik.
 *
 * Grafik kütüphanesi eklemiyoruz: tek bir halka için 50 kB JavaScript
 * indirmenin karşılığı yok ve SVG bunu tam olarak yapıyor. Kütüphane, veri
 * çeşitlendiğinde değer üretmeye başlar; burada tek bir dağılım var.
 *
 * Dilimler `stroke-dasharray` ile çiziliyor: tek bir daire, her dilim için
 * kesikli çizgi deseni ve dönme açısı. Yay yolu hesaplamaktan hem kısa hem
 * de kenar durumları (tek dilim, %100) kendiliğinden doğru çalışıyor.
 */

export interface HalkaDilimi {
  anahtar: string;
  etiket: string;
  deger: number;
  renk: string;
}

export function HalkaGrafik({
  dilimler,
  ortaUst,
  ortaAlt,
  boyut = 180,
}: {
  dilimler: HalkaDilimi[];
  ortaUst: string;
  ortaAlt?: string;
  boyut?: number;
}) {
  const toplam = dilimler.reduce((t, d) => t + d.deger, 0);
  if (toplam <= 0) {
    return null;
  }

  // Yarıçap, çizgi kalınlığı çıkarıldıktan sonra kalan alana göre.
  const kalinlik = boyut * 0.14;
  const yaricap = (boyut - kalinlik) / 2;
  const cevre = 2 * Math.PI * yaricap;

  let birikim = 0;

  return (
    <div
      className="relative shrink-0"
      style={{ width: boyut, height: boyut }}
      // Grafiğin taşıdığı bilgi yanındaki listede yazılı; ekran okuyucu
      // aynı sayıları iki kez okumasın.
      aria-hidden
    >
      <svg width={boyut} height={boyut} viewBox={`0 0 ${boyut} ${boyut}`}>
        <g transform={`rotate(-90 ${boyut / 2} ${boyut / 2})`}>
          {dilimler.map((dilim) => {
            const oran = dilim.deger / toplam;
            const uzunluk = oran * cevre;
            const kayma = birikim * cevre;
            birikim += oran;

            return (
              <circle
                key={dilim.anahtar}
                cx={boyut / 2}
                cy={boyut / 2}
                r={yaricap}
                fill="none"
                stroke={dilim.renk}
                strokeWidth={kalinlik}
                // Dilimler arasında ince boşluk: bitişik iki koyu renk
                // tek parça gibi görünüyordu.
                strokeDasharray={`${Math.max(uzunluk - 2, 0)} ${cevre}`}
                strokeDashoffset={-kayma}
                strokeLinecap="butt"
              />
            );
          })}
        </g>
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold tabular-nums">{ortaUst}</span>
        {ortaAlt !== undefined && (
          <span className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {ortaAlt}
          </span>
        )}
      </div>
    </div>
  );
}
