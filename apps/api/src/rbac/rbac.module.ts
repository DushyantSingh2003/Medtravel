import { Global, Module } from '@nestjs/common';
import { ScopeService } from './scope.service.js';

/** Data scoping for every module: the one place that knows which records a role sees. */
@Global()
@Module({ providers: [ScopeService], exports: [ScopeService] })
export class RbacModule {}
