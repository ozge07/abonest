/**
 * Sayfanın arkasındaki tema katmanı.
 *
 * Tamamen dekoratif: `aria-hidden` ve tıklamaları geçiriyor. Biçimlendirme
 * `index.css` içinde — hareket, şekiller ve renkler orada, gerekçeleriyle.
 *
 * Kabuk'un değil `App`'in içinde: giriş ve kayıt ekranlarında da görünüyor,
 * oralarda kabuk yok.
 */
export function TemaArkaplani() {
  return (
    <div className="tema-arkaplan" aria-hidden>
      <div className="tema-leke tema-leke-1" />
      <div className="tema-leke tema-leke-2" />
      <div className="tema-leke tema-leke-3" />

      {/* Üst üste duran abonelik kartlarını andıran siluetler. */}
      <div className="tema-kart tema-kart-1" />
      <div className="tema-kart tema-kart-2" />
      <div className="tema-kart tema-kart-3" />
      <div className="tema-kart tema-kart-4" />
      <div className="tema-kart tema-kart-5" />

      <div className="tema-izgara" />
    </div>
  );
}
