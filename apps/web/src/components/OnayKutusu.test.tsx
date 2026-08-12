/**
 * Onay kutusu.
 *
 * Geri alınamaz bir işlemin önündeki son durak. Buradaki iddiaların hepsi
 * "yanlışlıkla silinmesin" ekseninde.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OnayKutusu } from './OnayKutusu';

function ciz(ekler: Partial<Parameters<typeof OnayKutusu>[0]> = {}) {
  const onOnayla = vi.fn();
  const onVazgec = vi.fn();

  render(
    <OnayKutusu
      baslik="Netflix silinsin mi?"
      aciklama="Geri alınamaz."
      onOnayla={onOnayla}
      onVazgec={onVazgec}
      {...ekler}
    />,
  );

  return { onOnayla, onVazgec };
}

describe('onay kutusu', () => {
  it('başlığı ve açıklamayı gösteriyor', () => {
    ciz();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/netflix silinsin mi/i)).toBeInTheDocument();
    expect(screen.getByText(/geri alınamaz/i)).toBeInTheDocument();
  });

  it('açılınca odak vazgeç düğmesinde', () => {
    // Yanlışlıkla Enter'a basan kullanıcı silmiş olmasın.
    ciz();
    expect(screen.getByRole('button', { name: /vazgeç/i })).toHaveFocus();
  });

  it('sil düğmesi onaylıyor', async () => {
    const kullanici = userEvent.setup();
    const { onOnayla, onVazgec } = ciz();

    await kullanici.click(screen.getByRole('button', { name: /^sil$/i }));

    expect(onOnayla).toHaveBeenCalledTimes(1);
    expect(onVazgec).not.toHaveBeenCalled();
  });

  it('vazgeç düğmesi kapatıyor', async () => {
    const kullanici = userEvent.setup();
    const { onOnayla, onVazgec } = ciz();

    await kullanici.click(screen.getByRole('button', { name: /vazgeç/i }));

    expect(onVazgec).toHaveBeenCalledTimes(1);
    expect(onOnayla).not.toHaveBeenCalled();
  });

  it('Escape kapatıyor', async () => {
    const kullanici = userEvent.setup();
    const { onOnayla, onVazgec } = ciz();

    await kullanici.keyboard('{Escape}');

    expect(onVazgec).toHaveBeenCalled();
    expect(onOnayla).not.toHaveBeenCalled();
  });

  it('beklerken sil düğmesi kilitli', () => {
    // Çift tıklama iki silme isteği göndermemeli.
    ciz({ bekliyor: true });
    expect(screen.getByRole('button', { name: /siliniyor/i })).toBeDisabled();
  });

  it('buzlu cam bir kartın içinden açılsa da body altına çıkıyor', async () => {
    /*
     * Şikâyet: "hesabı silinsin dediğimde popup çok aşağıda kalıyor".
     * Sebep CSS: `backdrop-filter` taşıyan bir ata eleman, içindeki
     * `position: fixed` kutunun referansını ekran olmaktan çıkarıp kendisi
     * yapıyor. Kutu ekranın değil, kartın ortasına yerleşiyordu.
     *
     * Bu yüzden kutunun DOM'da kartın **dışında** olduğunu doğruluyoruz;
     * "ortada mı" sorusu jsdom'da düzen hesaplanmadığı için sınanamıyor.
     */
    const { container } = render(
      <div className="backdrop-blur-xl" data-testid="kart">
        <OnayKutusu
          baslik="Hesabın silinsin mi?"
          aciklama="Geri alınabilir."
          onOnayla={vi.fn()}
          onVazgec={vi.fn()}
        />
      </div>,
    );

    const kutu = await screen.findByRole('alertdialog');
    expect(container.querySelector('[data-testid="kart"]')).not.toContainElement(
      kutu,
    );
    expect(document.body).toContainElement(kutu);
  });

  it('ekran okuyucuya karar anı olduğunu söylüyor', () => {
    ciz();
    const kutu = screen.getByRole('alertdialog');
    expect(kutu).toHaveAttribute('aria-modal', 'true');
    expect(kutu).toHaveAccessibleName(/netflix silinsin mi/i);
    expect(kutu).toHaveAccessibleDescription(/geri alınamaz/i);
  });
});
