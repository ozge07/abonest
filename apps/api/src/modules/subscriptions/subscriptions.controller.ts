import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { CurrentUser, VerifiedEmail } from '../auth/auth.decorators.js';
import type { SessionUser } from '../auth/session.service.js';
import { SubscriptionsService } from './subscriptions.service.js';
import {
  createSubscriptionSchema, listQuerySchema, updateSubscriptionSchema,
  type CreateSubscriptionInput, type ListQuery, type UpdateSubscriptionInput,
} from './subscriptions.dto.js';

/**
 * Abonelik uçları.
 *
 * `@VerifiedEmail()` sınıf seviyesinde: e-postasını doğrulamamış kullanıcı
 * veri oluşturamıyor. Doğrulanmamış adreslerle hesap açıp veri biriktirmek,
 * hem çöp veri hem kötüye kullanım yolu.
 *
 * Yetki kontrolü burada **yok** — kasıtlı. Servis, kullanıcıya kapsanmış
 * depoyu kullanıyor ve `userId` filtresini o katman zorunlu kılıyor
 * (bkz. scoped.repository.ts). Denetleyicide `if` yazmak, unutulabilecek bir
 * adım eklemek olurdu.
 */
@Controller('subscriptions')
@VerifiedEmail()
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  async list(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ) {
    return this.subscriptions.list(user.id, query);
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createSubscriptionSchema))
    body: CreateSubscriptionInput,
  ) {
    return this.subscriptions.create(user.id, body);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptions.findOne(user.id, id);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSubscriptionSchema)) body: UpdateSubscriptionInput,
  ) {
    return this.subscriptions.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.subscriptions.remove(user.id, id);
  }

  @Post(':id/cancel')
  // Yeni kaynak oluşmuyor, var olanın durumu değişiyor: 201 değil 200.
  @HttpCode(200)
  async cancel(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptions.cancel(user.id, id);
  }

  @Post(':id/pause')
  // Yeni kaynak oluşmuyor, var olanın durumu değişiyor: 201 değil 200.
  @HttpCode(200)
  async pause(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptions.pause(user.id, id);
  }

  @Post(':id/resume')
  // Yeni kaynak oluşmuyor, var olanın durumu değişiyor: 201 değil 200.
  @HttpCode(200)
  async resume(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptions.resume(user.id, id);
  }

  @Get(':id/occurrences')
  async occurrences(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptions.occurrences(user.id, id);
  }
}
