/**
 * Para dönüşümlerinin testi.
 *
 * Arayüzde en riskli saf mantık burası: kullanıcının yazdığı tutarı kuruşa
 * çeviriyor. Buradaki bir hata doğrudan yanlış tutar kaydedilmesi demek ve
 * kullanıcı bunu ancak faturayla karşılaştırınca fark eder.
 */

import { describe, expect, it } from 'vitest';
import {
  donguYaz,
  gunSayisiYaz,
  kurusuMetneCevir,
  paraYaz,
  tarihKisaYaz,
  tarihYaz,
  tutariKurusaCevir,
} from './money';

describe('tutariKurusaCevir', () => {
  it('virgülü de noktayı da kabul ediyor', () => {
    // Türkçe klavyede ondalık ayracı virgül, ama kopyalanan tutarlar sık sık
    // nokta içeriyor. Kullanıcıyı hangisini kullanacağını düşünmeye zorlamak
    // sadece hata üretir.
    expect(tutariKurusaCevir('199,90', 'TRY')).toBe(19_990);
    expect(tutariKurusaCevir('199.90', 'TRY')).toBe(19_990);
  });

  it('kayan nokta hatası üretmiyor', () => {
    // `19.99 * 100` kayan noktada 1998.9999... veriyor; aşağı yuvarlanırsa
    // bir kuruş kayboluyor. Metinden okuma bunu tamamen atlıyor.
    expect(tutariKurusaCevir('19,99', 'TRY')).toBe(1_999);
    expect(tutariKurusaCevir('0,29', 'TRY')).toBe(29);
    expect(tutariKurusaCevir('1234,56', 'TRY')).toBe(123_456);
    expect(tutariKurusaCevir('8,70', 'TRY')).toBe(870);
  });

  it('eksik ondalık basamağı sıfırla tamamlıyor', () => {
    expect(tutariKurusaCevir('5', 'TRY')).toBe(500);
    expect(tutariKurusaCevir('5,3', 'TRY')).toBe(530);
    expect(tutariKurusaCevir('5,30', 'TRY')).toBe(530);
  });

  it('fazla basamağı kesiyor, yuvarlamıyor', () => {
    // Kesmek ile yuvarlamak farklı; hangisi olduğu belli olmalı.
    expect(tutariKurusaCevir('1,999', 'TRY')).toBe(199);
  });

  it('boşlukları yok sayıyor', () => {
    expect(tutariKurusaCevir('  12,50  ', 'TRY')).toBe(1_250);
    expect(tutariKurusaCevir('1 250', 'TRY')).toBe(125_000);
  });

  it('geçersiz girdide null dönüyor', () => {
    // Sessizce 0 dönmek, kullanıcının bedava abonelik kaydetmesi olurdu.
    for (const girdi of ['', 'abc', '-5', '1,2,3', '12₺', '.', ',', '1e3']) {
      expect(tutariKurusaCevir(girdi, 'TRY')).toBeNull();
    }
  });

  it('sıfırı geçerli sayıyor', () => {
    // Ücretsiz deneme gerçekten 0 olabiliyor.
    expect(tutariKurusaCevir('0', 'TRY')).toBe(0);
    expect(tutariKurusaCevir('0,00', 'TRY')).toBe(0);
  });

  it('büyük tutarları bozmuyor', () => {
    expect(tutariKurusaCevir('999999,99', 'TRY')).toBe(99_999_999);
  });
});

describe('kurusuMetneCevir ve gidiş-dönüş', () => {
  it('kuruşu okunabilir metne çeviriyor', () => {
    expect(kurusuMetneCevir(19_990, 'TRY')).toBe('199,90');
    expect(kurusuMetneCevir(29, 'TRY')).toBe('0,29');
    expect(kurusuMetneCevir(0, 'TRY')).toBe('0,00');
  });

  it('ileri geri çevirim değeri koruyor', () => {
    // Düzenleme ekranı kuruşu metne, kaydetme metni kuruşa çeviriyor.
    // İkisi ayrışırsa her düzenlemede tutar sessizce kayar.
    for (const kurus of [0, 1, 29, 500, 1_999, 19_990, 123_456, 99_999_999]) {
      const metin = kurusuMetneCevir(kurus, 'TRY');
      expect(tutariKurusaCevir(metin, 'TRY')).toBe(kurus);
    }
  });
});

describe('paraYaz', () => {
  it('para birimi simgesiyle yazıyor', () => {
    // Boşluk karakterleri yerele göre değişebiliyor (dar boşluk vb.),
    // o yüzden rakamlara ve simgeye bakıyoruz.
    const tl = paraYaz(19_990, 'TRY');
    expect(tl).toContain('199,90');
    expect(tl).toMatch(/₺|TRY/);

    const usd = paraYaz(1_299, 'USD');
    expect(usd).toContain('12,99');
    expect(usd).toMatch(/\$|USD/);
  });

  it('sıfırı gizlemiyor', () => {
    expect(paraYaz(0, 'TRY')).toContain('0,00');
  });

  it('binlik ayracı kullanıyor', () => {
    expect(paraYaz(123_456_789, 'TRY')).toContain('1.234.567,89');
  });
});

describe('donguYaz', () => {
  it('bilinen döngüleri Türkçe yazıyor', () => {
    expect(donguYaz('MONTHLY')).toBe('aylık');
    expect(donguYaz('YEARLY')).toBe('yıllık');
    expect(donguYaz('HALF_YEARLY')).toBe('6 aylık');
  });

  it('özel döngüde gün aralığını gösteriyor', () => {
    expect(donguYaz('CUSTOM', 45)).toBe('45 günde bir');
  });

  it('gün aralığı yoksa özel döngüyü genel yazıyor', () => {
    expect(donguYaz('CUSTOM', null)).toBe('özel');
    expect(donguYaz('CUSTOM')).toBe('özel');
  });

  it('bilinmeyen değeri olduğu gibi bırakıyor', () => {
    // Sunucu yeni bir döngü eklerse arayüz çökmemeli.
    expect(donguYaz('BILINMEYEN')).toBe('BILINMEYEN');
  });
});

describe('tarihYaz', () => {
  it('ISO günü Türkçe yazıyor', () => {
    expect(tarihYaz('2026-08-14')).toBe('14 Ağustos 2026');
  });

  it('ayın ilk ve son günü kaymıyor', () => {
    // Saat dilimi hatası burada bir gün kaydırır; UTC gün başlangıcıyla
    // ayrıştırmanın sebebi bu.
    expect(tarihYaz('2026-01-01')).toBe('1 Ocak 2026');
    expect(tarihYaz('2026-12-31')).toBe('31 Aralık 2026');
    expect(tarihYaz('2026-02-28')).toBe('28 Şubat 2026');
  });
});

describe('gunSayisiYaz', () => {
  it('yakın günleri insan diliyle söylüyor', () => {
    expect(gunSayisiYaz(0)).toBe('bugün');
    expect(gunSayisiYaz(1)).toBe('yarın');
    expect(gunSayisiYaz(5)).toBe('5 gün sonra');
  });

  it('geçmiş günü bugün sayıyor', () => {
    // Negatif gün "-3 gün sonra" diye yazılmamalı.
    expect(gunSayisiYaz(-3)).toBe('bugün');
  });
});

describe('tarihKisaYaz', () => {
  it('kısa ay adıyla yazıyor', () => {
    // Dar sütunlarda tam tarih satıra sığmıyordu.
    expect(tarihKisaYaz('2026-08-05')).toBe('5 Ağu');
  });

  it('ayın ilk ve son günü kaymıyor', () => {
    expect(tarihKisaYaz('2026-01-01')).toBe('1 Oca');
    expect(tarihKisaYaz('2026-12-31')).toBe('31 Ara');
  });
});
