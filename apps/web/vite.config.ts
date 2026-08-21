import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Sitenin herkese açık adresi.
 *
 * `robots.txt`'deki `Sitemap:` satırı, site haritasındaki adresler ve
 * `index.html`'deki `canonical`/Open Graph etiketleri **mutlak** adres
 * istiyor; göreli adres kabul edilmiyor. Üçünü de tek yerden besliyoruz,
 * yoksa alan adı değiştiğinde biri güncellenip diğerleri eski adreste
 * kalırdı — arama motoruna iki farklı site gibi görünürdü.
 *
 * Sunucu tarafında aynı değer `WEB_ORIGIN` olarak duruyor (doğrulama ve
 * şifre sıfırlama bağlantıları ondan üretiliyor). Kendi alan adına
 * geçildiğinde **ikisi birden** güncellenmeli.
 */
const SITE_ADRESI = (
  process.env['VITE_SITE_URL'] ?? 'https://abonest.onrender.com'
).replace(/\/+$/, '');

/** Arama motorlarının indekslemesine açık sayfalar. */
const HERKESE_ACIK_YOLLAR = ['/', '/giris', '/kayit'];

/**
 * `robots.txt` ve `sitemap.xml` üretiyor.
 *
 * `public/` altına elle konmadılar çünkü Vite o klasörü olduğu gibi
 * kopyalıyor, içindeki adresleri değiştirmiyor. Burada üretilince mutlak
 * adres tek kaynaktan geliyor.
 */
function aramaMotoruDosyalari(): Plugin {
  return {
    name: 'arama-motoru-dosyalari',
    // `index.html` içindeki `%SITE_ADRESI%` yer tutucusu dolduruluyor.
    // Geliştirmede de çalışıyor; yoksa tarayıcıda ham yer tutucu kalırdı.
    transformIndexHtml(html) {
      return html.replaceAll('%SITE_ADRESI%', SITE_ADRESI);
    },
    // Yalnızca derlemede çalışıyor: geliştirme sunucusunda paket üretilmiyor.
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: [
          'User-agent: *',
          // API JSON döndürüyor; indekslenecek bir şey yok ve taranması
          // boşuna istek demek.
          'Disallow: /api/',
          'Allow: /',
          '',
          `Sitemap: ${SITE_ADRESI}/sitemap.xml`,
          '',
        ].join('\n'),
      });

      const bugun = new Date().toISOString().slice(0, 10);
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...HERKESE_ACIK_YOLLAR.map((yol) =>
            [
              '  <url>',
              `    <loc>${SITE_ADRESI}${yol}</loc>`,
              `    <lastmod>${bugun}</lastmod>`,
              '  </url>',
            ].join('\n'),
          ),
          '</urlset>',
          '',
        ].join('\n'),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), aramaMotoruDosyalari()],
  server: {
    port: 5173,
    // API'ye vekil: tarayıcı her şeyi aynı origin'den görüyor, dolayısıyla
    // cookie'ler için CORS ve SameSite ayarıyla uğraşmak gerekmiyor.
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
