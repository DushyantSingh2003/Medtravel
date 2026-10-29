import { Controller, Get, Module, Post } from '@nestjs/common';
import { Can } from '../../src/auth/decorators.js';

/**
 * Stands in for the document endpoints F-06 will add, so the permission check on them can be proven now: a route declared with
 * `@Can(..., 'Document')` must refuse every role the matrix excludes.
 */
@Controller('probe/documents')
class DocumentsProbeController {
  @Get()
  @Can('read', 'Document')
  list(): { ok: true } {
    return { ok: true };
  }

  @Post()
  @Can('create', 'Document')
  upload(): { ok: true } {
    return { ok: true };
  }
}

@Module({ controllers: [DocumentsProbeController] })
export class DocumentsProbeModule {}
