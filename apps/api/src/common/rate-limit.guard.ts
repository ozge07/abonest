import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';

export interface RateLimit {
  /** Pencere içinde izin verilen istek sayısı. */
  limit: number;
  /** Pencere uzunluğu (ms). */
  windowMs: number;
  /** Sayaç anahtarına gövdeden hangi alan eklensin (örn. e-posta). */
  keyField?: string;
}

export const RATE_LIMIT = 'rate-limit';
export const Throttle = (options: RateLimit): MethodDecorator =>
  SetMetadata(RATE_LIMIT, options);

/**
 * Bellek içi kaba kuvvet koruması.
 *
 * **Tek sunucu varsayımıyla.** Birden çok örneğe geçilirse sayaçların ortak
 * bir yere (Postgres ya da Redis) taşınması gerekiyor; o güne kadar bellek
 * hem yeterli hem bedava. Bunu bilinçli seçtik — bkz. docs/decisions.md.
 *
 * Sayaç hem IP hem (varsa) e-posta bazında tutuluyor: tek IP'den farklı
 * hesapları denemek de, farklı IP'lerden tek hesabı denemek de sınırlanıyor.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const config = this.reflector.get<RateLimit>(RATE_LIMIT, context.getHandler());
    if (config === undefined) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const now = Date.now();
    this.evictExpired(now);

    for (const key of this.keysFor(request, config, context)) {
      const entry = this.hits.get(key);

      if (entry === undefined || entry.resetAt <= now) {
        this.hits.set(key, { count: 1, resetAt: now + config.windowMs });
        continue;
      }

      entry.count += 1;
      if (entry.count > config.limit) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        throw new HttpException(
          `Çok fazla deneme. ${retryAfter} saniye sonra tekrar dene.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    return true;
  }

  private keysFor(
    request: FastifyRequest,
    config: RateLimit,
    context: ExecutionContext,
  ): string[] {
    const route = `${context.getClass().name}.${context.getHandler().name}`;
    const keys = [`${route}:ip:${request.ip}`];

    if (config.keyField !== undefined) {
      const body = request.body as Record<string, unknown> | undefined;
      const value = body?.[config.keyField];
      if (typeof value === 'string') {
        keys.push(`${route}:${config.keyField}:${value.toLowerCase()}`);
      }
    }

    return keys;
  }

  /** Süresi dolmuş kayıtlar temizlenmezse harita sınırsız büyür. */
  private evictExpired(now: number): void {
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) {
        this.hits.delete(key);
      }
    }
  }
}
