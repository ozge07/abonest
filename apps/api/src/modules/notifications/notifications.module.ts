import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  // Günlük iş hatırlatma bildirimlerini bu servis üzerinden yazıyor.
  exports: [NotificationsService],
})
export class NotificationsModule {}
