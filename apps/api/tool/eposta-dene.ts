/**
 * SMTP ayarlarını sınayan araç.
 *
 * İki adım: önce sunucuya bağlanıp kimlik doğrulaması yapıyor, sonra
 * istenirse gerçek bir e-posta gönderiyor. Uygulamayı ayağa kaldırıp kayıt
 * olarak denemekten daha hızlı ve hatayı doğrudan gösteriyor.
 *
 *   npm run eposta:dene -w @abonelik/api                  # yalnızca bağlan
 *   npm run eposta:dene -w @abonelik/api -- ben@ornek.com # test postası at
 *
 * Şifre hiçbir zaman ekrana yazılmıyor.
 */

import 'dotenv/config';
import nodemailer from 'nodemailer';

const host = process.env['SMTP_HOST'];
const user = process.env['SMTP_USER'];
const pass = process.env['SMTP_PASS'];
const port = Number(process.env['SMTP_PORT'] ?? 587);
const from = process.env['MAIL_FROM'] ?? user;

if (host === undefined || user === undefined || pass === undefined) {
  console.error(
    'SMTP_HOST, SMTP_USER ve SMTP_PASS tanımlı olmalı (apps/api/.env).',
  );
  process.exit(1);
}

console.log(`Sunucu : ${host}:${port}`);
console.log(`Kullanıcı: ${user}`);
console.log(`Gönderen : ${from}`);
console.log('');

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: { user, pass },
});

try {
  await transporter.verify();
  console.log('✓ Bağlantı ve kimlik doğrulama başarılı.');
} catch (hata) {
  console.error('✗ Bağlanılamadı.');
  console.error(`  ${(hata as Error).message}`);
  console.error('');
  console.error('Sık görülen sebepler:');
  console.error('  · Normal hesap şifresi kullanılmış (uygulama şifresi gerekiyor)');
  console.error('  · İki adımlı doğrulama kapalı, uygulama şifresi üretilemiyor');
  console.error('  · Sağlayıcı bu hesap için SMTP erişimini kapatmış');
  process.exit(1);
}

const alici = process.argv[2];
if (alici === undefined) {
  console.log('');
  console.log('Test postası atmak için: ... -- alici@ornek.com');
  process.exit(0);
}

try {
  const sonuc = await transporter.sendMail({
    from,
    to: alici,
    subject: 'Abonelik Takip — test postası',
    text:
      'Bu bir testtir. Bunu okuyabiliyorsan e-posta gönderimi çalışıyor ve ' +
      'doğrulama postaları da ulaşacak.',
  });
  console.log(`✓ Gönderildi. Mesaj kimliği: ${sonuc.messageId}`);
  console.log('  Gelen kutusunu ve spam klasörünü kontrol et.');
} catch (hata) {
  console.error('✗ Gönderilemedi.');
  console.error(`  ${(hata as Error).message}`);
  process.exit(1);
}
