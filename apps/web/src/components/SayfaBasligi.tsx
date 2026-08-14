import { HarfHarf } from '../sahne/Katmanlar';

/**
 * Uygulama ekranlarının başlığı.
 *
 * Hikâye sayfasındaki bölüm başlıklarıyla aynı dil: Playfair italik,
 * harf harf açılan giriş. Girişten sonra hikâyeyi gezip Abonelikler'e
 * geçen kullanıcı iki farklı uygulamaya girmiş hissetmiyor.
 *
 * Hikâyedekinden **küçük**: orada başlık sayfanın konusu, burada bir
 * ekranın adı. Aynı boyutta olsalardı abonelik listesi bir sergi
 * duvarına dönerdi ve asıl iş (satırlar, tutarlar) ikinci plana düşerdi.
 *
 * Hareket azaltma tercihinde harfler yerinde beliriyor.
 */
export function SayfaBasligi({
  baslik,
  aciklama,
  children,
}: {
  baslik: string;
  aciklama?: string;
  /** Başlığın sağındaki eylem, örneğin "Yeni abonelik". */
  children?: React.ReactNode;
}) {
  const azalt =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div className="sayfa-basligi">
      <div className="min-w-0">
        <h1 className="sayfa-basligi-metni">
          <HarfHarf metin={baslik} gecikme={0.04} azalt={azalt} />
        </h1>
        {aciklama !== undefined && (
          <p className="sayfa-basligi-alt">{aciklama}</p>
        )}
      </div>
      {children}
    </div>
  );
}
