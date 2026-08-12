import {
  ConflictException,
  GoneException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { EmailSender } from '../../infra/email/email-sender.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { TokenService } from './token.service.js';
import { AuditService } from '../../infra/audit/audit.service.js';

const VERIFICATION_TTL_HOURS = 24;
const RESET_TTL_MINUTES = 30;

export interface RequestContext {
  userAgent?: string | undefined;
  ip?: string | undefined;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
    private readonly email: EmailSender,
  ) {}

  async register(input: {
    email: string;
    password: string;
    name: string;
    currency: string;
  }): Promise<{ userId: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });

    // Kayıt ucunda çakışmayı söylemek zorundayız — kullanıcı neden
    // kaydolamadığını bilmeli. Bu, `forgot-password`'dan farklı: orada
    // bilgiyi gizliyoruz çünkü kullanıcının bilmeye ihtiyacı yok.
    if (existing !== null) {
      throw new ConflictException('Bu e-posta adresi zaten kayıtlı');
    }

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash: await this.passwords.hash(input.password),
        name: input.name,
        currency: input.currency,
      },
      select: { id: true, email: true },
    });

    await this.sendVerification(user.id, user.email);
    return { userId: user.id };
  }

  async login(
    input: { email: string; password: string },
    context: RequestContext,
  ): Promise<{ token: string; expiresAt: Date }> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, passwordHash: true, deletedAt: true },
    });

    // Kullanıcı yoksa da özet doğrulaması süresi kadar bekliyoruz. Hemen
    // dönmek, yanıt süresinden hangi adreslerin kayıtlı olduğunu okumayı
    // mümkün kılardı.
    if (user === null || user.deletedAt !== null) {
      await this.passwords.wasteTime();
      // Kullanıcı kimliği yok — e-posta yazılmıyor, çünkü denetim kaydı
      // sızarsa kayıtlı adres listesi olurdu.
      await this.audit.record({ action: 'auth.login_failed', ip: context.ip });
      throw new UnauthorizedException('E-posta ya da şifre hatalı');
    }

    const ok = await this.passwords.verify(user.passwordHash, input.password);
    if (!ok) {
      await this.audit.record({
        action: 'auth.login_failed',
        userId: user.id,
        ip: context.ip,
      });
      // Mesaj, e-posta yanlış olduğunda dönenle **birebir aynı**. Farklı
      // mesaj vermek hangi adreslerin kayıtlı olduğunu söylerdi.
      throw new UnauthorizedException('E-posta ya da şifre hatalı');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.audit.record({
      action: 'auth.login',
      userId: user.id,
      ip: context.ip,
    });

    return this.sessions.create(user.id, context);
  }

  async verifyEmail(token: string): Promise<void> {
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: this.tokens.hash(token) },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });

    if (
      record === null ||
      record.usedAt !== null ||
      record.expiresAt.getTime() <= Date.now()
    ) {
      // Üç durum da aynı yanıtı veriyor: "yok", "kullanılmış" ve "süresi
      // dolmuş" arasındaki farkı söylemek saldırgana bilgi verir.
      throw new GoneException('Doğrulama bağlantısı geçersiz ya da süresi dolmuş');
    }

    await this.audit.record({
      action: 'auth.email_verified',
      userId: record.userId,
    });

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      // Token tek kullanımlık: işaretlemezsek aynı bağlantı tekrar tekrar
      // kullanılabilir.
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);
  }

  /**
   * Şifre sıfırlama isteği.
   *
   * **Her durumda başarılı görünüyor.** E-posta kayıtlı değilse de aynı yanıt
   * dönüyor; aksi hâlde bu uç, hangi adreslerin sistemde olduğunu tarayarak
   * öğrenmek için kullanılabilirdi.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, deletedAt: true },
    });

    if (user === null || user.deletedAt !== null) {
      return;
    }

    const { token, hash } = this.tokens.generate();
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000),
      },
    });

    await this.email.send({
      to: user.email,
      subject: 'Şifre sıfırlama',
      text:
        `Şifreni sıfırlamak için bu kodu kullan: ${token}\n\n` +
        `Kod ${RESET_TTL_MINUTES} dakika geçerli. ` +
        'Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.',
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.tokens.hash(token) },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });

    if (
      record === null ||
      record.usedAt !== null ||
      record.expiresAt.getTime() <= Date.now()
    ) {
      throw new GoneException('Sıfırlama kodu geçersiz ya da süresi dolmuş');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: await this.passwords.hash(newPassword) },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // Şifre sıfırlandıysa hesap büyük ihtimalle ele geçirilmişti; saldırganın
    // açık oturumu da düşmeli. Bunu yapmazsak sıfırlamanın koruyucu değeri
    // olmaz.
    await this.sessions.revokeAll(record.userId);
    await this.audit.record({
      action: 'auth.password_reset',
      userId: record.userId,
    });
  }

  /**
   * Doğrulama kodunu yeniden gönderiyor.
   *
   * Uç `docs/api.md` içinde yazıyordu ama uygulanmamıştı: doğrulama
   * e-postasını kaçıran kullanıcının yeni kod alma yolu yoktu ve hesabı
   * kalıcı olarak yarım kalıyordu.
   *
   * Zaten doğrulanmış hesapta sessizce hiçbir şey yapmıyor — istemciye
   * "bu adres zaten doğrulanmış" demek, oturumu olmayan biri için bilgi
   * sızıntısı olurdu; burada oturum var ama davranışı tutarlı tutuyoruz.
   */
  async resendVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true, emailVerifiedAt: true },
    });

    if (user === null || user.emailVerifiedAt !== null) {
      return;
    }

    // Eski kodlar geçersiz kalıyor: aynı anda birden çok geçerli kod
    // dolaşması, çalınan bir kodun ömrünü uzatır.
    await this.prisma.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    await this.sendVerification(user.id, user.email);
  }

  async sendVerification(userId: string, email: string): Promise<void> {
    const { token, hash } = this.tokens.generate();

    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: hash,
        expiresAt: new Date(
          Date.now() + VERIFICATION_TTL_HOURS * 60 * 60 * 1000,
        ),
      },
    });

    await this.email.send({
      to: email,
      subject: 'E-posta adresini doğrula',
      text:
        `Hesabını etkinleştirmek için bu kodu kullan: ${token}\n\n` +
        `Kod ${VERIFICATION_TTL_HOURS} saat geçerli.`,
    });
  }
}
