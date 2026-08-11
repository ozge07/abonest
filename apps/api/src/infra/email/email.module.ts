import { Global, Module } from '@nestjs/common';
import { LOGGER } from '../logger/logger.token.js';
import { ConsoleEmailSender } from './console-email-sender.js';
import { EmailSender } from './email-sender.js';

/**
 * E-posta gönderimi — altyapı, iş modülü değil.
 *
 * Önce `AuthModule` içindeydi; oraya konmasının tek sebebi ilk kullanıcısının
 * kimlik akışları olmasıydı. Günlük iş de hatırlatma göndermeye başlayınca
 * bağımlılık ters yöne dönüyordu: işler modülü kimlik modülünü içe aktarmak
 * zorunda kalırdı. Altyapı, onu kullanan modüllerden birinin içinde
 * yaşamamalı.
 *
 * `@Global()` çünkü tek bir gönderici örneği var ve her modülün onu ayrıca
 * içe aktarması tören olurdu.
 */
@Global()
@Module({
  providers: [
    {
      provide: EmailSender,
      useFactory: (logger) => new ConsoleEmailSender(logger),
      inject: [LOGGER],
    },
  ],
  exports: [EmailSender],
})
export class EmailModule {}
