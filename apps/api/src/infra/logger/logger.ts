import { pino, type Logger } from 'pino';
import type { AppConfig } from '../config/config.js';

/**
 * Yapılandırılmış (JSON) loglama.
 *
 * Üretimde log'lar bir toplayıcı tarafından okunacak; serbest metin yerine
 * alanlara ayrılmış kayıt aranabilir oluyor.
 *
 * **Hassas veri asla loglanmıyor.** `redact` listesi şifre, token ve cookie
 * alanlarını kayıt anında siliyor — geliştirici yanlışlıkla tüm istek
 * gövdesini loglasa bile sır dışarı çıkmıyor. Güvenliği dikkate değil,
 * yapılandırmaya bağlıyoruz.
 */
export function createLogger(config: AppConfig): Logger {
  // Geliştirmede okunabilir çıktı, üretimde ham JSON (toplayıcı için).
  //
  // `transport` alanı koşullu **yayılıyor**, `undefined` atanmıyor: tsconfig'de
  // `exactOptionalPropertyTypes` açık, yani "alanı verme" ile "undefined ver"
  // farklı şeyler. Bu ayrımı korumak, isteğe bağlı alanların yanlışlıkla
  // silinmesini derleme anında yakalıyor.
  const gelistirme = config.NODE_ENV === 'development';

  return pino({
    level: config.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.passwordHash',
        '*.token',
        '*.tokenHash',
        '*.sessionToken',
      ],
      censor: '[gizlendi]',
    },
    ...(gelistirme
      ? {
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'HH:MM:ss' },
          },
        }
      : {}),
  });
}
