import { Injectable } from '@nestjs/common';
import type { Logger } from 'pino';
import { EmailSender, type EmailMessage } from './email-sender.js';

const UC = 'https://api.brevo.com/v3/smtp/email';

export interface BrevoAyarlari {
  apiKey: string;
  from: string;
  replyTo?: string | undefined;
}

/**
 * E-posta gönderimi — Brevo'nun HTTP API'si üzerinden.
 *
 * ## Neden SMTP değil
 *
 * SMTP taşınabilir ve sağlayıcıdan bağımsız; bu yüzden ilk tercih oydu.
 * Ama yayına çıkınca duvara toslandı: barındırma platformu **giden SMTP
 * portlarını kapatıyor**. Hata kimlikle ilgili bile değildi —
 * `ETIMEDOUT, command: CONN`, yani bağlantı hiç kurulamıyor. Aynı bilgiler
 * geliştirme makinesinde sorunsuz çalışıyordu; fark ağdaydı.
 *
 * Bu gönderici 443 üzerinden konuşuyor. Hiçbir platform HTTPS'i kapatmıyor,
 * çünkü kapatırsa hiçbir şey çalışmaz.
 *
 * ## Bedeli
 *
 * Sağlayıcıya bağımlılık. SMTP göndericisi duruyor ve `SMTP_HOST` verilirse
 * o kullanılıyor; yani başka bir sağlayıcıya geçmek hâlâ ortam değişkeni
 * işi. Bu dosya yalnızca "SMTP'nin yasak olduğu yerde de çalışsın" için var.
 */
@Injectable()
export class BrevoApiEmailSender extends EmailSender {
  constructor(
    private readonly ayarlar: BrevoAyarlari,
    private readonly logger: Logger,
  ) {
    super();
  }

  async send(message: EmailMessage): Promise<void> {
    const gonderen = ayrisGonderen(this.ayarlar.from);

    const yanit = await fetch(UC, {
      method: 'POST',
      headers: {
        'api-key': this.ayarlar.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: gonderen,
        ...(this.ayarlar.replyTo !== undefined
          ? { replyTo: ayrisGonderen(this.ayarlar.replyTo) }
          : {}),
        to: [{ email: message.to }],
        subject: message.subject,
        textContent: message.text,
      }),
    });

    if (!yanit.ok) {
      /*
       * Gövdeyi hata mesajına koyuyoruz: Brevo reddetme sebebini orada
       * söylüyor ("sender not valid" gibi) ve o cümle olmadan hata
       * ayıklamak körlemesine deneme oluyor. Anahtar gövdede geçmiyor.
       */
      const govde = await yanit.text();
      throw new Error(
        `Brevo e-postayı reddetti (HTTP ${yanit.status}): ${govde.slice(0, 200)}`,
      );
    }

    const sonuc = (await yanit.json()) as { messageId?: string };
    // Alıcı adresi loglanmıyor: kişisel veri ve zaten veritabanında.
    this.logger.info({ messageId: sonuc.messageId }, 'E-posta gönderildi');
  }

  /**
   * Anahtarı sınıyor.
   *
   * Açılışta çağrılıyor. SMTP'deki `verify()` karşılığı: yanlış anahtarla
   * ayağa kalkan bir uygulama, hatayı ilk kayıt olan kullanıcıya kadar
   * saklar ve o kullanıcı hesabını hiç doğrulayamaz.
   *
   * Hesap uçları anahtarı doğruluyor ama e-posta göndermiyor; sınama için
   * gerçek posta atmak istemiyoruz.
   */
  async dogrulaBaglanti(): Promise<boolean> {
    try {
      const yanit = await fetch('https://api.brevo.com/v3/account', {
        headers: { 'api-key': this.ayarlar.apiKey, accept: 'application/json' },
      });

      if (!yanit.ok) {
        this.logger.error(
          { durum: yanit.status },
          'Brevo anahtarı kabul edilmedi — e-postalar gönderilemeyecek',
        );
        return false;
      }

      this.logger.info('Brevo API anahtarı doğrulandı');
      return true;
    } catch (hata) {
      this.logger.error(
        { hata },
        'Brevo API\'sine ulaşılamadı — e-postalar gönderilemeyecek',
      );
      return false;
    }
  }
}

/**
 * `MAIL_FROM` değerini Brevo'nun beklediği şekle ayırıyor.
 *
 * Değer iki biçimde gelebiliyor: `"Ad <adres@example.com>"` ya da düz
 * `adres@example.com`. Brevo ad ve adresi ayrı alanlarda istiyor; düz
 * metni olduğu gibi göndermek "sender not valid" hatası veriyor.
 */
export function ayrisGonderen(from: string): { name?: string; email: string } {
  const eslesme = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  if (eslesme === null) {
    return { email: from.trim() };
  }

  const ad = eslesme[1]?.replace(/^"|"$/g, '').trim() ?? '';
  const adres = eslesme[2]?.trim() ?? '';
  return ad === '' ? { email: adres } : { name: ad, email: adres };
}
