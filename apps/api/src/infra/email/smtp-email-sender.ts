import { Injectable } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Logger } from 'pino';
import { EmailSender, type EmailMessage } from './email-sender.js';

export interface SmtpAyarlari {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  replyTo?: string | undefined;
}

/**
 * Gerçek e-posta gönderimi — SMTP üzerinden.
 *
 * Sağlayıcıya bağlı değil: Gmail, Outlook, Brevo, kendi sunucun — hepsi SMTP
 * konuşuyor. Sağlayıcıya özel bir SDK bağlamak, sağlayıcı değiştiğinde kod
 * değiştirmek demek olurdu; burada değişen tek şey ortam değişkenleri.
 *
 * ## Bağlantı bir kez kuruluyor
 *
 * `nodemailer` havuzu açık: her e-posta için yeni bir TLS el sıkışması
 * yapmak, hatırlatma işi otuz kişiye posta atarken gözle görülür gecikme
 * üretir.
 */
@Injectable()
export class SmtpEmailSender extends EmailSender {
  private readonly transporter: Transporter;

  constructor(
    private readonly ayarlar: SmtpAyarlari,
    private readonly logger: Logger,
  ) {
    super();

    this.transporter = nodemailer.createTransport({
      host: ayarlar.host,
      port: ayarlar.port,
      // 465 örtük TLS; diğer portlarda STARTTLS ile yükseltiliyor.
      secure: ayarlar.port === 465,
      auth: { user: ayarlar.user, pass: ayarlar.pass },
      pool: true,
      maxConnections: 3,
    });
  }

  async send(message: EmailMessage): Promise<void> {
    const sonuc = await this.transporter.sendMail({
      from: this.ayarlar.from,
      ...(this.ayarlar.replyTo !== undefined
        ? { replyTo: this.ayarlar.replyTo }
        : {}),
      to: message.to,
      subject: message.subject,
      text: message.text,
    });

    // Alıcı adresi loglanmıyor: kişisel veri ve zaten veritabanında.
    // Mesaj kimliği sağlayıcıda arama yapmayı mümkün kılıyor.
    this.logger.info({ messageId: sonuc.messageId }, 'E-posta gönderildi');
  }

  /**
   * Sunucuya bağlanıp kimlik doğrulamasını sınıyor.
   *
   * Açılışta çağrılıyor: yanlış SMTP bilgisiyle ayağa kalkan bir uygulama,
   * hatayı ilk kayıt olan kullanıcıya kadar saklar ve o kullanıcı hesabını
   * hiç doğrulayamaz. Bağlantı kurulamazsa **çökmüyoruz** — e-posta dışındaki
   * her şey çalışmaya devam etmeli — ama gürültülü şekilde uyarıyoruz.
   */
  async dogrulaBaglanti(): Promise<boolean> {
    try {
      await this.transporter.verify();
      this.logger.info(
        { host: this.ayarlar.host, port: this.ayarlar.port },
        'SMTP bağlantısı doğrulandı',
      );
      return true;
    } catch (hata) {
      this.logger.error(
        { hata, host: this.ayarlar.host, port: this.ayarlar.port },
        'SMTP bağlantısı kurulamadı — e-postalar gönderilemeyecek',
      );
      return false;
    }
  }
}
