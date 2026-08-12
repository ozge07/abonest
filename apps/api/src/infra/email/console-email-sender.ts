import { Injectable } from '@nestjs/common';
import type { Logger } from 'pino';
import { EmailSender, type EmailMessage } from './email-sender.js';

/**
 * Geliştirme sağlayıcısı: e-postayı göndermek yerine loga yazıyor.
 *
 * Böylece Phase 3'te hiçbir servise kaydolmak, hiçbir SMTP sunucusu kurmak
 * gerekmiyor — doğrulama linki terminalde görünüyor. Gerçek sağlayıcı
 * Phase 6'da, bu arayüzün arkasına geliyor.
 */
@Injectable()
export class ConsoleEmailSender extends EmailSender {
  /** Hiçbir yere gitmiyor; günlüğe yazılıyor. */
  override get deliversToInbox(): boolean {
    return false;
  }

  constructor(private readonly logger: Logger) {
    super();
  }

  async send(message: EmailMessage): Promise<void> {
    this.logger.info(
      { to: message.to, subject: message.subject },
      `E-POSTA (geliştirme):\n${message.text}`,
    );
    return Promise.resolve();
  }
}
