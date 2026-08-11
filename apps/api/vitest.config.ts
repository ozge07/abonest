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
  },
});
