import { Module } from '@nestjs/common';
import { PricingController } from './pricing.controller.js';
import { PricingService } from './pricing.service.js';
import { FxAdminService } from './fx-admin.service.js';

@Module({ controllers: [PricingController], providers: [PricingService, FxAdminService] })
export class PricingModule {}
