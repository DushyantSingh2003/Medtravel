import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module.js';
import { LeadIntakeService } from './lead-intake.service.js';
import { LeadsController, PublicLeadsController } from './leads.controller.js';
import { LeadsService } from './leads.service.js';
import { PatientMergeService } from './patient-merge.service.js';
import { TurnstileService } from './turnstile.service.js';

@Module({
  imports: [CasesModule],
  controllers: [PublicLeadsController, LeadsController],
  providers: [LeadIntakeService, LeadsService, PatientMergeService, TurnstileService],
  exports: [LeadIntakeService],
})
export class LeadsModule {}
