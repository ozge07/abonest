import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { OccurrenceService } from './occurrence.service.js';
import { SubscriptionsController } from './subscriptions.controller.js';
import { SubscriptionsService } from './subscriptions.service.js';

@Module({
  // Abonelik eklenir eklenmez hatırlatma penceresine giriyorsa posta
  // gitmeli; beklemek "yarın" hatırlatmasını tamamen kaçırıyordu.
  imports: [NotificationsModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, OccurrenceService],
  // Günlük iş de ödeme üretimini kullanıyor.
  exports: [OccurrenceService],
})
export class SubscriptionsModule {}
