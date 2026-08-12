import { z } from 'zod';

/**
 * Ortam değişkenleri.
 *
 * **Eksik ya da geçersiz değerde uygulama açılışta çöker**, çalışma anında
 * değil. Yanlış yapılandırmayı ilk isteğe kadar saklamak, hatayı üretimde
 * rastgele bir anda ortaya çıkarır; açılışta çökmek deploy'un başarısız
 * olmasını sağlar ve sorun anında görünür.
 */
const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().url(),

  /**
   * Oturum token'larının imzalanmasında kullanılıyor. En az 32 karakter:
   * kısa bir sır, kaba kuvvetle bulunabilir.
   */
  SESSION_SECRET: z.string().min(32),

  /** Tarayıcının uygulamayı çağırdığı adres — CORS için. */
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),

  /** GitHub Actions cron'unun günlük işi tetiklerken kullandığı sır. */
  CRON_SECRET: z.string().min(32),

  /**
   * Uygulamanın önündeki güvenilir vekil sayısı ya da `false`.
   *
   * **Varsayılan `false` ve bu bilinçli.** Açık olduğunda Fastify istemcinin
   * IP'sini `X-Forwarded-For` başlığından okuyor; uygulamaya doğrudan
   * erişilebiliyorsa o başlığı istemci kendisi yazabiliyor ve IP tabanlı
   * hız sınırı işe yaramaz hâle geliyor. Ölçtük: açıkken sahte başlıkla
   * arka arkaya dokuz hesap açılabiliyordu.
   *
   * Yayında uygulamanın önünde gerçekten bir vekil varsa atlanacak vekil
   * sayısı yazılıyor (çoğu platformda `1`).
   */
  TRUST_PROXY: z
    .union([z.literal('false'), z.coerce.number().int().min(0).max(10)])
    .default('false')
    .transform((deger) => (deger === 'false' ? false : deger)),

  /*
   * SMTP ayarları — hepsi isteğe bağlı.
   *
   * `SMTP_HOST` boşsa e-posta gönderilmiyor, sunucu günlüğüne yazılıyor.
   * Geliştirmede istenen davranış bu; yayında eksik bırakılırsa kullanıcılar
   * hesaplarını doğrulayamaz, o yüzden üretim kontrolü aşağıda uyarıyor.
   */
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().max(65535).default(587),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  /** Gönderen adresi; çoğu sağlayıcı bunun doğrulanmış olmasını istiyor. */
  MAIL_FROM: z.string().min(1).optional(),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
});

export type AppConfig = z.infer<typeof schema>;

/**
 * `.env.example` içindeki yer tutucu sırlar.
 *
 * Bunlar depoda açıkta duruyor. Üretime kopyala-yapıştırla taşınırsa oturum
 * imzası ve cron sırrı herkesin bildiği bir değer olur — ve bu, hiç kimsenin
 * fark etmeyeceği türden bir hata. Açılışta çökmek tek güvenilir savunma.
 */
const ORNEK_SIRLAR = [
  'degistir-en-az-32-karakter-olmali-1234',
  'degistir-en-az-32-karakter-olmali-5678',
];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = schema.safeParse(env);

  if (!result.success) {
    // Hata mesajında değerleri değil yalnızca alan adlarını yazıyoruz;
    // log'a sır düşmemeli.
    const eksik = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Ortam değişkenleri geçersiz. Uygulama başlatılmıyor:\n${eksik}\n\n` +
        '.env.example dosyasını örnek alabilirsin.',
    );
  }

  const config = result.data;
  if (config.NODE_ENV === 'production') {
    assertUretimeHazir(config);
  }
  return config;
}

/**
 * Üretimde sessizce yanlış olabilecek şeyleri açılışta yakalıyor.
 *
 * Hepsi "çalışır ama güvensiz" kategorisinde: uygulama ayağa kalkar, testler
 * geçer, sorun ancak birileri istismar edince görünür.
 */
function assertUretimeHazir(config: AppConfig): void {
  const sorunlar: string[] = [];

  for (const [ad, deger] of [
    ['SESSION_SECRET', config.SESSION_SECRET],
    ['CRON_SECRET', config.CRON_SECRET],
  ] as const) {
    if (ORNEK_SIRLAR.includes(deger)) {
      sorunlar.push(`${ad}: .env.example'daki örnek değer kullanılıyor`);
    }
  }

  if (config.SESSION_SECRET === config.CRON_SECRET) {
    sorunlar.push('SESSION_SECRET ve CRON_SECRET aynı; ayrı olmalılar');
  }

  if (config.SMTP_HOST === undefined) {
    sorunlar.push(
      'SMTP_HOST tanımlı değil; kullanıcılar doğrulama e-postası alamaz',
    );
  }

  if (config.WEB_ORIGIN.startsWith('http://')) {
    sorunlar.push(
      'WEB_ORIGIN https değil; oturum cookie\'si Secure bayrağıyla gönderiliyor',
    );
  }

  if (sorunlar.length > 0) {
    throw new Error(
      `Üretim yapılandırması güvenli değil. Uygulama başlatılmıyor:\n` +
        sorunlar.map((s) => `  ${s}`).join('\n'),
    );
  }
}
