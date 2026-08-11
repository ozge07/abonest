import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ValidationProblem } from '../infra/errors/problem.js';

/**
 * Gövde doğrulaması.
 *
 * **Sunucu, istemci doğrulamasına asla güvenmiyor.** Aynı Zod şeması
 * frontend'de de kullanılacak ama o yalnızca kullanıcı deneyimi; güvenlik
 * kararı burada veriliyor.
 *
 * Şemadaki hatalar alan bazında RFC 9457 yanıtına dönüşüyor, böylece istemci
 * hangi alanı düzelteceğini biliyor.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
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
