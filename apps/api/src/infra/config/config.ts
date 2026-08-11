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

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
});

export type AppConfig = z.infer<typeof schema>;

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

  return result.data;
}
