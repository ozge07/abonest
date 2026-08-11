import { Controller, Get } from '@nestjs/common';
import { CurrentUser, VerifiedEmail } from '../auth/auth.decorators.js';
import type { SessionUser } from '../auth/session.service.js';
import { DashboardService } from './dashboard.service.js';

@Controller('dashboard')
@VerifiedEmail()
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  async summary(@CurrentUser() user: SessionUser) {
    return this.dashboard.summary(user.id);
  }
}
