import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { CurrentUser, VerifiedEmail } from '../auth/auth.decorators.js';
import type { SessionUser } from '../auth/session.service.js';
import { notificationQuerySchema, type NotificationQuery } from './notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
@VerifiedEmail()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(notificationQuerySchema)) query: NotificationQuery,
  ) {
    return this.notifications.list(user.id, query);
  }

  /**
   * Okunmamış sayısı ayrı bir uç.
   *
   * Arayüz bunu sık soruyor (rozet için) ama listeyi nadiren açıyor. Sayıyı
   * öğrenmek için 20 bildirimi indirmek gereksiz trafik.
   */
  @Get('unread-count')
  async unreadCount(@CurrentUser() user: SessionUser) {
    return this.notifications.unreadCount(user.id);
  }

  @Patch(':id/read')
  @HttpCode(204)
  async markRead(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.notifications.markRead(user.id, id);
  }

  @Post('read-all')
  @HttpCode(204)
  async markAllRead(@CurrentUser() user: SessionUser): Promise<void> {
    await this.notifications.markAllRead(user.id);
  }
}
