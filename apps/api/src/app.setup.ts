import fastifyCookie from '@fastify/cookie';
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
 * Helmet yerine elle yazılıyor: bu bir **JSON API**, HTML sunmuyor.
 * Helmet'in değerinin çoğu HTML uygulamalarına yönelik varsayılanlardan
 * geliyor; buradaki liste kısa ve her satırın neden orada olduğu belli.
 * Anlamadığımız bir bağımlılık eklemektense anladığımız beş başlık.
 */
const GUVENLIK_BASLIKLARI: Record<string, string> = {
  // Tarayıcı içerik türünü tahmin etmesin: JSON'u HTML sanıp çalıştırmasın.
  'x-content-type-options': 'nosniff',
  // API çerçeve içine alınmamalı; clickjacking'in kapısı.
  'x-frame-options': 'DENY',
  // Adres satırındaki token ya da kimlik başka siteye sızmasın.
  'referrer-policy': 'no-referrer',
  // API hiçbir kaynak yüklemiyor; en dar politika doğru olan.
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  // Başka bir sitenin yanıtı doğrudan gömmesini engelliyor.
  'cross-origin-resource-policy': 'same-origin',
};

export async function configureApp(
  app: NestFastifyApplication,
  logger: Logger,
  options: { corsOrigin?: string; production?: boolean } = {},
): Promise<void> {
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onSend', (_istek, yanit, govde, ileri) => {
      for (const [ad, deger] of Object.entries(GUVENLIK_BASLIKLARI)) {
        void yanit.header(ad, deger);
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

  app.setGlobalPrefix('api/v1', {
    // Sağlık uçları sürüm dışında: altyapı bunları sabit adreste bekliyor.
    exclude: ['health', 'ready'],
  });

  // Cookie okuma/yazma. Guard oturum cookie'sini buradan görüyor.
  await app.register(fastifyCookie);

  app.useGlobalFilters(new ProblemFilter(logger));

  if (options.corsOrigin !== undefined) {
    app.enableCors({
      origin: options.corsOrigin,
      // Oturum cookie'si için şart; `*` ile birlikte çalışmaz.
      credentials: true,
    });
  }
}
