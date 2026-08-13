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

      {/*
        Yavaşça dönen tekrar halkaları — logodaki motifin büyütülmüş hâli.
        Yerlerinde duran kart siluetleri vardı; ötelenme yavaşken hareket
        ettikleri görülmüyordu, dönme ise fark ediliyor.
      */}
      <div className="tema-halka tema-halka-1" />
      <div className="tema-halka tema-halka-2" />
      <div className="tema-halka tema-halka-3" />

      <div className="tema-izgara" />
    </div>
  );
}
