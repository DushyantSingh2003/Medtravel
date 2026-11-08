import { Module } from '@nestjs/common';
import { HospitalRequestsController } from './hospital-requests.controller.js';
import { PartnerHealthService } from './partner-health.service.js';
import { PartnerHospitalsService } from './partner-hospitals.service.js';
import { PartnerRequestsService } from './partner-requests.service.js';
import { PartnersController } from './partners.controller.js';

@Module({
  controllers: [PartnersController, HospitalRequestsController],
  providers: [PartnerRequestsService, PartnerHospitalsService, PartnerHealthService],
})
export class PartnersModule {}
