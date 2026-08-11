import { Module } from '@nestjs/common';
import { OccurrenceService } from './occurrence.service.js';
import { SubscriptionsController } from './subscriptions.controller.js';
import { SubscriptionsService } from './subscriptions.service.js';

@Module({
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, OccurrenceService],
  // Günlük iş de ödeme üretimini kullanıyor.
  exports: [OccurrenceService],
})
export class SubscriptionsModule {}
