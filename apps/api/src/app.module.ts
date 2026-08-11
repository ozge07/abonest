import { Module } from '@nestjs/common';
import { PrismaService } from './infra/database/prisma.service.js';
import { HealthController } from './modules/health/health.controller.js';

/**
 * Kök modül. Her domain modülü buraya eklenecek; şimdilik yalnızca sağlık
 * kontrolü var (Phase 2 iskeleti).
 */
@Module({
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}
