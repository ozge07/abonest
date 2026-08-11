import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from './audit.service.js';

/** Altyapı; birçok modül yazıyor, hiçbirine ait değil. */
@Global()
@Module({
  providers: [PrismaService, AuditService],
  exports: [AuditService],
})
export class AuditModule {}
