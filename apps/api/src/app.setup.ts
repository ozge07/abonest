import { existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Logger } from 'pino';
import { ProblemFilter } from './infra/errors/problem.js';

/**
 * Uygulamanın HTTP davranışı.
 *
 * Bu ayarlar `main.ts` içinde durduğu sürece testler onları göremiyordu:
 * test kendi uygulamasını kuruyor, `ProblemFilter`'ı almıyor ve hata
 * yanıtları üretimdekinden farklı çıkıyordu. Bir doğrulama testi tam bu
 * yüzden yanlış yerde patladı — yanıt gövdesinde `errors` alanı yoktu, çünkü
 * devrede Nest'in varsayılan filtresi vardı.
 *
 * Ortak fonksiyon, "testte geçti ama üretimde farklı davranıyor" sınıfını
 * ortadan kaldırıyor.
 */
/**
 * Güvenlik başlıkları.
 *
 * Helmet yerine elle yazılıyor: liste kısa ve her satırın neden orada olduğu
 * belli. Anlamadığımız bir bağımlılık eklemektense anladığımız beş başlık.
 */
const GUVENLIK_BASLIKLARI: Record<string, string> = {
  // Tarayıcı içerik türünü tahmin etmesin: JSON'u HTML sanıp çalıştırmasın.
  'x-content-type-options': 'nosniff',
  // Uygulama çerçeve içine alınmamalı; clickjacking'in kapısı.
  'x-frame-options': 'DENY',
  // Adres satırındaki token ya da kimlik başka siteye sızmasın.
  'referrer-policy': 'no-referrer',
  // API hiçbir kaynak yüklemiyor; en dar politika doğru olan. Arayüz
  // sayfaları için bu politika aşağıda gevşetiliyor — aynı katılıkta
  // kalsaydı arayüzün kendi betiği de engellenirdi.
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  // Başka bir sitenin yanıtı doğrudan gömmesini engelliyor.
  'cross-origin-resource-policy': 'same-origin',
};

/**
 * Arayüz sayfaları için politika.
 *
 * API'ninki `default-src 'none'` — arayüz o politikayla sunulsaydı kendi
 * betiğini ve stilini yükleyemez, sayfa bomboş açılırdı. Burada yalnızca
 * kendi origin'ine izin veriliyor; `unsafe-inline` **stil için** gerekli
 * çünkü Vite kritik stilleri satır içine gömüyor, betik için verilmiyor.
 */
const ARAYUZ_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export async function configureApp(
  app: NestFastifyApplication,
  logger: Logger,
  options: {
    corsOrigin?: string;
    production?: boolean;
    /** Derlenmiş arayüzün klasörü; verilirse aynı origin'den sunuluyor. */
    webRoot?: string;
  } = {},
): Promise<void> {
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onSend', (_istek, yanit, govde, ileri) => {
      for (const [ad, deger] of Object.entries(GUVENLIK_BASLIKLARI)) {
        void yanit.header(ad, deger);
      }
      // HTML yanıtları arayüz sayfası; kendi kaynaklarını yükleyebilmeli.
      const tur = yanit.getHeader('content-type');
      if (typeof tur === 'string' && tur.includes('text/html')) {
        void yanit.header('content-security-policy', ARAYUZ_CSP);
      }
      // HSTS yalnızca üretimde: yerelde http üzerinden çalışıyoruz ve
      // tarayıcıya "bu alan adına hep https ile gel" demek geliştirme
      // ortamını kilitler.
      if (options.production === true) {
        void yanit.header(
          'strict-transport-security',
          'max-age=31536000; includeSubDomains',
        );
      }
      ileri(null, govde);
    });

  /*
   * İstek günlüğü.
   *
   * Her isteğin sonucu ve süresi kaydediliyor; `requestId` hata yanıtındaki
   * değerle aynı, yani kullanıcı "şu kimlikle hata aldım" dediğinde ilgili
   * satır doğrudan bulunabiliyor.
   *
   * Sağlık uçları hariç: yük dengeleyici bunları saniyede bir çağırıyor ve
   * gerçek trafiği günlükte boğuyorlar.
   */
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onResponse', (istek, yanit, ileri) => {
      const yol = istek.url.split('?')[0] ?? '';
      if (yol === '/health' || yol === '/ready') {
        ileri();
        return;
      }

      const seviye = yanit.statusCode >= 500 ? 'error' : 'info';
      logger[seviye](
        {
          requestId: istek.id,
          method: istek.method,
          // Sorgu dizesi yazılmıyor: arama terimi kişisel veri olabiliyor.
          url: yol,
          status: yanit.statusCode,
          sureMs: Math.round(yanit.elapsedTime),
        },
        'istek',
      );
      ileri();
    });

  app.setGlobalPrefix('api/v1', {
    // Sağlık uçları sürüm dışında: altyapı bunları sabit adreste bekliyor.
    exclude: ['health', 'ready'],
  });

  // Cookie okuma/yazma. Guard oturum cookie'sini buradan görüyor.
  await app.register(fastifyCookie);

  app.useGlobalFilters(new ProblemFilter(logger, options.webRoot));

  if (options.webRoot !== undefined) {
    await serveWeb(app, options.webRoot);
  }

  if (options.corsOrigin !== undefined) {
    app.enableCors({
      origin: options.corsOrigin,
      // Oturum cookie'si için şart; `*` ile birlikte çalışmaz.
      credentials: true,
    });
  }
}

/**
 * Derlenmiş arayüzü **aynı origin'den** sunuyor.
 *
 * ## Neden aynı origin
 *
 * Oturum bir cookie'de ve `SameSite=Lax`. Arayüz ayrı bir alan adında
 * dursaydı o cookie yazma isteklerinde gönderilmezdi; çalıştırmak için
 * `SameSite=None` gerekirdi ve bu, CSRF'e karşı ilk savunma hattını
 * kaldırmak demek. Ayrıca CORS'u gevşetmek ve kimlik bilgisi taşıyan
 * çapraz-origin istekleri açmak gerekirdi.
 *
 * Tek origin bunların hiçbirine ihtiyaç bırakmıyor: tarayıcı her şeyi tek
 * yerden görüyor, cookie kendiliğinden gidiyor, CORS devreye hiç girmiyor.
 * Bedeli API sürecinin statik dosya da servis etmesi — bu ölçekte ölçülebilir
 * bir maliyet değil.
 *
 * ## SPA geri dönüşü
 *
 * Bilinmeyen yollar `index.html`'e düşüyor; bu geri dönüş `ProblemFilter`
 * içinde, çünkü Nest kendi 404 işleyicisini `init()` sırasında kuruyor ve
 * Fastify ikinci bir tane kabul etmiyor. Filtre Nest'in yönlendiricisinden
 * sonra çalıştığı için gerçek uçlar etkilenmiyor.
 */
async function serveWeb(
  app: NestFastifyApplication,
  webRoot: string,
): Promise<void> {
  await app.register(fastifyStatic, {
    root: webRoot,
    // Kendi 404'ümüzü yöneteceğiz; eklenti araya girmesin.
    wildcard: false,
    // Eklentinin kendi `cache-control`'ü (public, max-age=0) aşağıdaki
    // ayarı eziyordu; yönetimi tamamen bize bırakıyoruz.
    cacheControl: false,
    /*
     * `assets/` altındaki her şeyin adında içerik özeti var (Vite'ın
     * varsayılanı: `index-7p8dBqvH.js`). İçerik değişince ad da değiştiği
     * için bu dosyalar sonsuza kadar önbelleklenebilir.
     *
     * `index.html` önbelleklenemez: adı sabit ve içindeki varlık adlarını
     * o taşıyor. Önbelleğe alınsaydı yeni sürüm kullanıcıya hiç ulaşmazdı.
     */
    // v10'da geri çağırım ham `ServerResponse` yerine `FastifyReply`
    // alıyor; başlık `setHeader` ile değil `header` ile yazılıyor.
    setHeaders: (yanit, yol) => {
      const surekli = yol.includes(`${sep}assets${sep}`);
      void yanit.header(
        'cache-control',
        surekli ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    },
  });

}

