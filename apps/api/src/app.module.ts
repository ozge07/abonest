import { Module } from '@nestjs/common';
import { PrismaService } from './infra/database/prisma.service.js';
import { HealthController } from './modules/health/health.controller.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { AuditModule } from './infra/audit/audit.module.js';
import { EmailModule } from './infra/email/email.module.js';
import { JobsModule } from './modules/jobs/jobs.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { RatesModule } from './modules/rates/rates.module.js';
import { LoggerModule } from './infra/logger/logger.module.js';

/**
 * Kök modül. Her domain modülü buraya ekleniyor.
 *
 * `AuthModule` global: guard'ları ve oturum servisini her modül görebiliyor.
 */
@Module({
  // LoggerModule ilk sırada: global olduğu için diğerleri onu görebilsin.
  imports: [
    LoggerModule,
    EmailModule,
    AuditModule,
    AuthModule,
    UsersModule,
    SubscriptionsModule,
    CatalogModule,
    DashboardModule,
    AnalyticsModule,
    NotificationsModule,
    RatesModule,
    JobsModule,
  ],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}
