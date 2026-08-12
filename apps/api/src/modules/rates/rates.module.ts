import { Module } from '@nestjs/common';
import { RatesController } from './rates.controller.js';
import { RatesService } from './rates.service.js';

@Module({
  controllers: [RatesController],
  providers: [RatesService],
  // Günlük iş kurları tazeliyor.
  exports: [RatesService],
})
export class RatesModule {}
