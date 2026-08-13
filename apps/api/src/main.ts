import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
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

  // Arayüz derlenmişse aynı origin'den sunuluyor. Geliştirmede Vite kendi
  // sunucusunda çalıştığı için bu klasör yok ve API salt API kalıyor.
  const webRoot = bulWebRoot();

  /*
   * Üretimde arayüz olmadan açılmıyoruz.
   *
   * Bu tam olarak yaşandı: derleme yarım kaldı, arayüz klasörü hiç
   * oluşmadı, uygulama sorunsuz ayağa kalktı ve **API olarak** çalışmaya
   * devam etti. Sağlık kontrolü yeşil, veritabanı bağlı, ama siteyi açan
   * herkes 404 görüyordu. Yayında sessizce yarım çalışmaktansa hiç
   * açılmamak daha iyi: biri fark edene kadar geçen süre, hatanın kendisi
   * kadar zarar veriyor.
   *
   * Geliştirmede geçerli değil — orada arayüzü Vite sunuyor ve bu klasör
   * bilerek yok.
   */
  if (config.NODE_ENV === 'production' && webRoot === undefined) {
    throw new Error(
      'Arayüz derlemesi bulunamadı (apps/web/dist). Derleme yarım kalmış ' +
        'olabilir; `npm run build -w @abonelik/web` çıktısını kontrol et.',
    );
  }

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      // Her isteğe kimlik: log kaydıyla hata yanıtı bu değerle eşleşiyor.
      genReqId: () => crypto.randomUUID(),
      // Yapılandırmadan geliyor ve varsayılanı kapalı: açıkken istemci
      // kendi IP'sini uydurabiliyor ve hız sınırını atlatıyor.
      trustProxy: config.TRUST_PROXY,
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

  await configureApp(app, logger, {
    // Arayüz aynı origin'den sunuluyorsa CORS'a hiç gerek yok; ayrı
    // barındırılıyorsa `WEB_ORIGIN` devreye giriyor.
    ...(webRoot === undefined ? { corsOrigin: config.WEB_ORIGIN } : {}),
    production: config.NODE_ENV === 'production',
    ...(webRoot !== undefined ? { webRoot } : {}),
  });

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

/**
 * Derlenmiş arayüzün klasörünü bulur; yoksa `undefined`.
 *
 * Varlığına bakıyoruz, ortam değişkenine değil: "arayüz derlendi mi"
 * sorusunun cevabı dosya sisteminde zaten var ve ikinci bir bayrak
 * tutmak, ikisinin ayrışabileceği bir yer daha demek olurdu.
 */
function bulWebRoot(): string | undefined {
  // Derleme çıktısı CommonJS; `import.meta` kullanılamıyor.
  // `dist/` içinden iki üst klasör depo kökündeki `apps/` oluyor.
  const aday = join(__dirname, '../../web/dist');
  return existsSync(aday) ? aday : undefined;
}
