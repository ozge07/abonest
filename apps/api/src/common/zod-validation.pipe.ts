import {
  type ArgumentMetadata,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import type { ZodType } from 'zod';
import { ValidationProblem } from '../infra/errors/problem.js';

/**
 * Gövde ve sorgu dizesi doğrulaması.
 *
 * **Sunucu, istemci doğrulamasına asla güvenmiyor.** Aynı Zod şeması
 * frontend'de de kullanılacak ama o yalnızca kullanıcı deneyimi; güvenlik
 * kararı burada veriliyor.
 *
 * Şemadaki hatalar alan bazında RFC 9457 yanıtına dönüşüyor, böylece istemci
 * hangi alanı düzelteceğini biliyor.
 *
 * ## Neden yalnızca `body` ve `query`
 *
 * `@UsePipes()` metot seviyesinde yazıldığında Nest bu pipe'ı handler'ın
 * **bütün** parametrelerine uyguluyor — `@CurrentUser()` gibi özel
 * dekoratörler dahil. O durumda şema gövde yerine oturum nesnesini
 * doğrulamaya çalışıyor ve istek, gövde kusursuz olsa bile "bütün alanlar
 * eksik" diye reddediliyor. Canlı denemede tam olarak bu oldu.
 *
 * Tür süzgeci bunu yapısal olarak engelliyor: pipe nereye takılırsa takılsın
 * yalnızca kullanıcıdan gelen veriye bakıyor.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, metadata?: ArgumentMetadata): T {
    if (
      metadata !== undefined &&
      metadata.type !== 'body' &&
      metadata.type !== 'query'
    ) {
      return value as T;
    }

    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ValidationProblem(
        result.error.issues.map((issue) => ({
          field: issue.path.join('.') || '(gövde)',
          message: issue.message,
        })),
      );
    }
    return result.data;
  }
}
