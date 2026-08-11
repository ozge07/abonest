import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { loadConfig } from './infra/config/config.js';
import { createLogger } from './infra/logger/logger.js';
import { LOGGER } from './infra/logger/logger.token.js';

/**
 * API giriş noktası.
 *
 * Sıra önemli: **önce yapılandırma doğrulanıyor.** Geçersiz ortamda Nest hiç
 * ayağa kalkmıyor — yarım yapılandırmayla çalışan bir süreç, hatayı ilk
 * isteğe kadar saklar.
 */
async function bootstrap(): Promise<void> {
  // `.env` yalnızca yerelde okunuyor. Üretimde değişkenler platform
  // tarafından veriliyor; oraya dosya taşımak sırrı imaja gömmek demek olurdu.
  // Node 20.12+ bu işi yerleşik yapıyor, dotenv bağımlılığı gerekmiyor.
  if (process.env['NODE_ENV'] !== 'production') {
    try {
      process.loadEnvFile();
    } catch {
      // .env yoksa sorun değil: değişkenler kabukta verilmiş olabilir.
      // Gerçekten eksikse zaten loadConfig() aşağıda çökertecek.
    }
  }

  const config = loadConfig();
  const logger = createLogger(config);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      // Her isteğe kimlik: log kaydıyla hata yanıtı bu değerle eşleşiyor.
      genReqId: () => crypto.randomUUID(),
      trustProxy: true,
    }),
    {
      logger: false,
      // **Varsayılan `true` olsaydı bootstrap hatası sessizce yutulurdu:**
      // Nest hatayı kendi logger'ına yazıp süreci kapatıyor, logger kapalı
      // olduğu için ekrana hiçbir şey düşmüyor. `false` ile hata bize geliyor
      // ve aşağıdaki `catch` onu görünür kılıyor.
      abortOnError: false,
    },
  );

  await configureApp(app, logger, { corsOrigin: config.WEB_ORIGIN });

  // Kapanma sinyalinde açık istekler tamamlanıyor, bağlantılar kapanıyor.
  app.enableShutdownHooks();

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  logger.info(
    { port: config.PORT, env: config.NODE_ENV },
    'API dinlemeye başladı',
  );
}

bootstrap().catch((error: unknown) => {
  // Açılış hatası gürültülü olmalı: sessizce kapanan bir süreç, deploy'un
  // "başarılı" görünüp uygulamanın ayakta olmaması demek.
  console.error('API başlatılamadı:', error);
  process.exit(1);
});
