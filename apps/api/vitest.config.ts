import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * Test dosyaları **sırayla** koşuyor.
     *
     * Entegrasyon testleri tek bir Postgres veritabanını paylaşıyor ve günlük
     * iş tasarımı gereği bütün kullanıcıları tarıyor. Dosyalar paralel
     * koşarsa bir dosyanın ürettiği abonelik, başka bir dosyanın günlük iş
     * sayaçlarına karışıyor — testler çoğu zaman geçer, ara sıra düşer. Ara
     * sıra düşen test, hiç olmayan testten daha zararlı: insanı "yine o
     * bilinen hata" demeye alıştırıyor.
     *
     * Maliyeti düşük; bütün paket birkaç saniye sürüyor.
     */
    fileParallelism: false,

    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/main.ts'],
      /*
       * Eşikler mevcut seviyenin biraz altında.
       *
       * Amaç yüzdeyi yükseltmek değil, **düşüşü fark etmek**. Eşiği tam
       * mevcut değere koymak, ilgisiz bir düzenlemede CI'ı kırar ve insanı
       * testi değil eşiği düzeltmeye iter. Yüzdeyi hedef yapmak da kapsam
       * tiyatrosu üretir: her satıra dokunan ama hiçbir şey iddia etmeyen
       * testler.
       */
      thresholds: {
        statements: 90,
        branches: 65,
        functions: 90,
        lines: 90,
      },
    },
  },
});
