import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SaglayiciSecici } from './SaglayiciSecici';
import type { Saglayici } from '../lib/types';

/**
 * Sağlayıcı seçici.
 *
 * Açılır liste yerine logolu ızgara: kullanıcı "Netflix" kelimesini değil,
 * kırmızı kutuyu arıyor. HTML'in kendi `<select>`'i görsel taşıyamıyor.
 */

function saglayici(
  ad: string,
  ekler: Partial<Saglayici> = {},
): Saglayici {
  return {
    id: ad.toLowerCase(),
    name: ad,
    slug: ad.toLowerCase(),
    logoUrl: null,
    color: null,
    website: null,
    defaultCategoryId: null,
    defaultBillingCycle: null,
    defaultCurrency: null,
    ...ekler,
  };
}

/*
 * Türkçe büyük İ, küçük 'i'ye standart kurallarla dönüşmüyor: `/internet/i`
 * deseni "İnternet" ile **eşleşmiyor**. Bileşenin filtresi doğru çalışıyor
 * (`toLocaleLowerCase('tr')` kullanıyor); sorgudaki desenden baştaki harfi
 * çıkarıyoruz.
 */
const INTERNET = /nternet paketi/i;

const LISTE = [
  saglayici('Netflix', { logoUrl: '/logolar/netflix.png', color: '#E50914' }),
  saglayici('Spotify', { logoUrl: '/logolar/spotify.png', color: '#1DB954' }),
  saglayici('İnternet Paketi'),
  saglayici('Türk Telekom'),
];

function ciz(seciliId = '', onSec = vi.fn()) {
  render(
    <SaglayiciSecici
      saglayicilar={LISTE}
      seciliId={seciliId}
      onSec={onSec}
    />,
  );
  return onSec;
}

describe('liste', () => {
  it('her sağlayıcıyı düğme olarak gösteriyor', () => {
    ciz();
    expect(screen.getByRole('button', { name: /netflix/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /spotify/i })).toBeInTheDocument();
  });

  it('logosu olanda görsel çiziyor', () => {
    ciz();
    const netflix = screen.getByRole('button', { name: /netflix/i });
    expect(netflix.querySelector('img')).toHaveAttribute(
      'src',
      '/logolar/netflix.png',
    );
  });

  it('logosu olmayanda harf karosuna düşüyor', () => {
    ciz();
    const tt = screen.getByRole('button', { name: /türk telekom/i });
    expect(tt.querySelector('img')).toBeNull();
  });
});

describe('arama', () => {
  it('yazdıkça daraltıyor', async () => {
    const kullanici = userEvent.setup();
    ciz();

    await kullanici.type(screen.getByLabelText(/servis ara/i), 'netf');

    expect(screen.getByRole('button', { name: /netflix/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /spotify/i })).toBeNull();
  });

  it('Türkçe harfleri eşleştiriyor', async () => {
    // "internet" yazan kullanıcı "İnternet Paketi"ni bulabilmeli; düz
    // `toLowerCase()` İ'yi i'ye çevirmiyor.
    const kullanici = userEvent.setup();
    ciz();

    await kullanici.type(screen.getByLabelText(/servis ara/i), 'internet');

    expect(screen.getByRole('button', { name: INTERNET })).toBeInTheDocument();
  });

  it('eşleşme yoksa kendi adını yazabileceğini söylüyor', async () => {
    const kullanici = userEvent.setup();
    ciz();

    await kullanici.type(screen.getByLabelText(/servis ara/i), 'boyleBirSeyYok');

    expect(screen.getByText(/kendin yazabilirsin/i)).toBeInTheDocument();
  });
});

describe('seçim', () => {
  it('tıklayınca sağlayıcıyı bildiriyor', async () => {
    const kullanici = userEvent.setup();
    const onSec = ciz();

    await kullanici.click(screen.getByRole('button', { name: /netflix/i }));

    expect(onSec).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Netflix' }),
    );
  });

  it('seçili olanı işaretliyor', () => {
    ciz('netflix');
    expect(screen.getByRole('button', { name: /netflix/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /spotify/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('seçiliye tekrar tıklayınca seçimi kaldırıyor', async () => {
    const kullanici = userEvent.setup();
    const onSec = ciz('netflix');

    await kullanici.click(screen.getByRole('button', { name: /netflix/i }));

    expect(onSec).toHaveBeenCalledWith(null);
  });

  it('seçim varken kaldırma bağlantısı çıkıyor', async () => {
    const kullanici = userEvent.setup();
    const onSec = ciz('netflix');

    await kullanici.click(screen.getByRole('button', { name: /seçimi kaldır/i }));

    expect(onSec).toHaveBeenCalledWith(null);
  });

  it('seçim yokken kaldırma bağlantısı yok', () => {
    ciz();
    expect(screen.queryByRole('button', { name: /seçimi kaldır/i })).toBeNull();
  });
});
