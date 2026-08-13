import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { HatirlatmaService } from './hatirlatma.service.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, HatirlatmaService],
  // Günlük iş hatırlatma bildirimlerini bu servis üzerinden yazıyor.
  exports: [NotificationsService, HatirlatmaService],
})
export class NotificationsModule {}
