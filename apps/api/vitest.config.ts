import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * Testler **ayrı bir veritabanında** koşuyor (`..._test`).
     *
     * Ayrım olmadan testler geliştirme verisinin üstüne çıkıyordu: günlük
     * iş bütün aktif abonelikleri tarıyor ve testler onu sahte bir "bugün"
     * ile çağırıyor. Gerçek bir kullanıcının ziline "Netflix ödemesi bugün"
     * bildirimi böyle düştü — oysa ödeme 30 gün sonraydı.
     *
     * Kurulum kendi kendine: veritabanı yoksa oluşturuluyor, şema ve
     * başlangıç verisi uygulanıyor.
     */
    globalSetup: ['./test/kurulum.ts'],

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
