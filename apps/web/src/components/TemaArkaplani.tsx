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
        Dönen ışık süpürmesi: arka planın canlı hissini asıl bu veriyor.
        Lekelerin arkasında, yayların önünde duruyor.
      */}
      <div className="tema-aura" />

      {/*
        Yörünge yayları. Kesikli tam halkalar vardı; tam halka statik bir
        çerçeve gibi duruyordu, yayın ucu ise sürekli yer değiştirdiği
        için döndüğü apaçık görülüyor.
      */}
      <div className="tema-yay tema-yay-1" />
      <div className="tema-yay tema-yay-2" />
      <div className="tema-yay tema-yay-3" />

      <div className="tema-izgara" />
    </div>
  );
}
