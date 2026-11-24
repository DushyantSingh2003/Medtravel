import { Module } from '@nestjs/common';
import { CaseStageService } from './case-stage.service.js';
import { CasesController } from './cases.controller.js';
import { CasesService } from './cases.service.js';
import { StageConfigService } from './stage-config.service.js';

@Module({
  controllers: [CasesController],
  providers: [CasesService, CaseStageService, StageConfigService],
  exports: [CaseStageService, CasesService],
})
export class CasesModule {}
