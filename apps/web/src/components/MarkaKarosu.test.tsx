/**
 * Marka karosu.
 *
 * Logo dosyası yerine markanın rengi ve baş harfleri kullanılıyor. Buradaki
 * iddiaların çoğu "gözle bakınca fark edilmez ama yanlış" türünden:
 * kararlılık, Türkçe büyütme ve metin okunabilirliği.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkaKarosu } from './MarkaKarosu';

/** Karo `aria-hidden`; anlamı yanındaki ad taşıyor. */
function karo(ad: string, renk?: string | null) {
  const { container } = render(<MarkaKarosu ad={ad} renk={renk} />);
  return container.firstElementChild as HTMLElement;
}

describe('baş harfler', () => {
  it('tek kelimede ilk harfi alıyor', () => {
    expect(karo('Netflix').textContent).toBe('N');
  });

  it('çok kelimede iki harf alıyor', () => {
    // "Spor Salonu" ile "Spotify" tek harfle ayırt edilemezdi.
    expect(karo('Spor Salonu').textContent).toBe('SS');
  });

  it('Türkçe büyütme kuralına uyuyor', () => {
    // `toUpperCase()` "istanbul"u "I" yapıyor; Türkçede "İ" olmalı.
    expect(karo('iCloud+').textContent).toBe('İ');
    expect(karo('istanbul Kart').textContent).toBe('İK');
  });

  it('boş ada dayanıyor', () => {
    expect(karo('   ').textContent).toBe('?');
  });
});

describe('renk', () => {
  it('marka rengi verilmişse onu kullanıyor', () => {
    expect(karo('Netflix', '#E50914').style.backgroundColor).toBe(
      'rgb(229, 9, 20)',
    );
  });

  it('marka rengi yoksa addan kararlı bir renk türetiyor', () => {
    // Kararlılık şart: aynı abonelik her açılışta aynı renkte görünmeli,
    // yoksa kullanıcı listede aradığını renkten bulamaz.
    const birinci = karo('Spor Salonu').style.backgroundColor;
    const ikinci = karo('Spor Salonu').style.backgroundColor;

    expect(birinci).not.toBe('');
    expect(birinci).toBe(ikinci);
  });

  it('farklı adlar farklı renk alıyor', () => {
    expect(karo('Spor Salonu').style.backgroundColor).not.toBe(
      karo('Türk Telekom').style.backgroundColor,
    );
  });
});

describe('metin okunabilirliği', () => {
  it('koyu markada beyaz yazı', () => {
    expect(karo('Netflix', '#E50914').style.color).toBe('rgb(255, 255, 255)');
  });

  it('açık markada koyu yazı', () => {
    // Turkcell'in sarısında beyaz yazı okunmuyordu.
    expect(karo('Turkcell', '#FFC900').style.color).toBe('rgb(15, 23, 42)');
  });

  it('türetilmiş renkte beyaz yazı', () => {
    // Türetilen tonlar sabit parlaklıkta ve koyu.
    expect(karo('Spor Salonu').style.color).toBe('rgb(255, 255, 255)');
  });
});

describe('erişilebilirlik', () => {
  it('ekran okuyucudan gizli', () => {
    // Harfler dekoratif; abonelik adı zaten hemen yanında yazıyor.
    // `queryByText` aria-hidden'a bakmıyor, o yüzden nitelik doğrudan
    // sınanıyor — erişilebilirlik ağacını gören sorgu `getByRole`.
    expect(karo('Netflix', '#E50914')).toHaveAttribute('aria-hidden', 'true');
  });

  it('erişilebilirlik ağacında görünmüyor', () => {
    render(<MarkaKarosu ad="Netflix" renk="#E50914" />);
    expect(screen.queryByText('N', { ignore: '[aria-hidden="true"]' })).toBeNull();
  });
});
