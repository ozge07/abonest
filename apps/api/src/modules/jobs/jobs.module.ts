import { Module } from '@nestjs/common';
import { EmailSender } from '../../infra/email/email-sender.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { RatesModule } from '../rates/rates.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { DailyJobService } from './daily.service.js';
import { JobsController } from './jobs.controller.js';

@Module({
  imports: [SubscriptionsModule, NotificationsModule, RatesModule],
  controllers: [JobsController],
  providers: [DailyJobService],
})
export class JobsModule {}
