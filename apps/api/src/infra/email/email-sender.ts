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

/** Gönderen kimliği; her göndericinin ihtiyacı olan ortak alanlar. */
export interface GonderenKimligi {
  /** `MAIL_FROM` — "Ad <adres>" ya da düz adres. */
  from: string;
  /**
   * Yanıt adresi. Verilmezse yanıtlar gönderen adrese, yani uygulamayı
   * çalıştıran kişinin özel kutusuna gidiyor.
   */
  replyTo?: string | undefined;
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
