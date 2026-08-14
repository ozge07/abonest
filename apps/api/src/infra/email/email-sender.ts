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

  /**
   * Posta gerçekten alıcının kutusuna gidiyor mu?
   *
   * Arayüz bunu kullanıcıya doğru şeyi söylemek için soruyor: geliştirmede
   * "gelen kutunu kontrol et" demek, olmayan bir postayı beklettirmek olur.
   * Varsayılan `true` — yeni bir gönderici eklendiğinde sessizce "gitmiyor"
   * demesindense, unutulduğunda gözle görülür şekilde yanlış olsun.
   */
  get deliversToInbox(): boolean {
    return true;
  }
}
