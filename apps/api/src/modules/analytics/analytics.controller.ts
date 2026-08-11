import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { CurrentUser, VerifiedEmail } from '../auth/auth.decorators.js';
import type { SessionUser } from '../auth/session.service.js';
import {
  spendingQuerySchema,
  unusedQuerySchema,
  type SpendingQuery,
  type UnusedQuery,
} from './analytics.dto.js';
import { AnalyticsService } from './analytics.service.js';

@Controller('analytics')
@VerifiedEmail()
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('spending')
  async spending(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(spendingQuerySchema)) query: SpendingQuery,
  ) {
    return this.analytics.spending(user.id, query);
  }

  @Get('unused')
  async unused(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(unusedQuerySchema)) query: UnusedQuery,
  ) {
    return this.analytics.unused(user.id, query.thresholdDays);
  }
}
