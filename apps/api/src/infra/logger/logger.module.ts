import { Global, Module } from '@nestjs/common';
import { LOGGER } from './logger.token.js';
import { createLogger } from './logger.js';
import { loadConfig } from '../config/config.js';

/**
 * Logger'ı DI kabına koyan global modül.
 *
 * **Neden AppModule'de değil:** Nest'te alt modüller üst modülün
 * sağlayıcılarını göremiyor. `AuthModule` AppModule tarafından import
 * edildiği için AppModule'deki LOGGER'a erişemiyordu. `@Global()` bir modül
 * ise bir kez import edildiğinde her yerden görünüyor.
 */
@Global()
@Module({
  providers: [{ provide: LOGGER, useFactory: () => createLogger(loadConfig()) }],
  exports: [LOGGER],
})
export class LoggerModule {}
