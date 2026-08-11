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
export async function configureApp(
  app: NestFastifyApplication,
  logger: Logger,
  options: { corsOrigin?: string } = {},
): Promise<void> {
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
