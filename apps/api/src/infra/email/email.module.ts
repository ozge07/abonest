import { Global, Module } from '@nestjs/common';
import type { Logger } from 'pino';
import { loadConfig } from '../config/config.js';
import { LOGGER } from '../logger/logger.token.js';
import { BrevoApiEmailSender } from './brevo-api-email-sender.js';
import { ConsoleEmailSender } from './console-email-sender.js';
import { EmailSender } from './email-sender.js';
import { SmtpEmailSender } from './smtp-email-sender.js';

/**
 * E-posta gönderimi — altyapı, iş modülü değil.
 *
 * Hangi göndericinin kullanılacağı **yapılandırmadan** belliy: `SMTP_HOST`
 * doluysa gerçek gönderim, boşsa günlüğe yazma. Ayrı bir "mod" bayrağı
 * tutmuyoruz; iki ayarın ayrışabileceği bir yer daha olurdu.
 *
 * `@Global()` çünkü tek bir gönderici örneği var ve her modülün onu ayrıca
 * içe aktarması tören olurdu.
 */
@Global()
@Module({
  providers: [
    {
      provide: EmailSender,
      useFactory: (logger: Logger): EmailSender => {
        const config = loadConfig();

        /*
         * Sıra: önce HTTP API, sonra SMTP.
         *
         * Yayında SMTP çalışmıyor — barındırma platformu giden portları
         * kapatıyor ve bağlantı `ETIMEDOUT` ile düşüyor. HTTP anahtarı
         * verilmişse onu tercih ediyoruz; geliştirmede SMTP kalabiliyor.
         */
        if (config.BREVO_API_KEY !== undefined) {
          const sender = new BrevoApiEmailSender(
            {
              apiKey: config.BREVO_API_KEY,
              from: config.MAIL_FROM ?? config.SMTP_USER ?? '',
            },
            logger,
          );
          void sender.dogrulaBaglanti();
          return sender;
        }

        if (
          config.SMTP_HOST === undefined ||
          config.SMTP_USER === undefined ||
          config.SMTP_PASS === undefined
        ) {
          logger.warn(
            'SMTP yapılandırılmadı; e-postalar gönderilmeyip günlüğe yazılacak',
          );
          return new ConsoleEmailSender(logger);
        }

        const sender = new SmtpEmailSender(
          {
            host: config.SMTP_HOST,
            port: config.SMTP_PORT,
            user: config.SMTP_USER,
            pass: config.SMTP_PASS,
            // Gönderen belirtilmemişse kullanıcı adı çoğu sağlayıcıda
            // adresin kendisi oluyor.
            from: config.MAIL_FROM ?? config.SMTP_USER,
          },
          logger,
        );

        // Açılışta sınanıyor ama çökertmiyor: e-posta dışındaki her şey
        // çalışmaya devam etmeli.
        void sender.dogrulaBaglanti();
        return sender;
      },
      inject: [LOGGER],
    },
  ],
  exports: [EmailSender],
})
export class EmailModule {}
