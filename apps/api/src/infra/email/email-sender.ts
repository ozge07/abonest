/**
 * E-posta gönderimi arayüzü.
 *
 * Sağlayıcı (Brevo, SendGrid, SMTP) bunun arkasında duruyor: değiştirmek tek
 * dosyalık iş ve iş mantığı sağlayıcıyı hiç bilmiyor.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export abstract class EmailSender {
  abstract send(message: EmailMessage): Promise<void>;
}
