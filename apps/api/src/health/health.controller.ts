import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Health } from '@medtravel/contracts';
import { Public } from '../auth/decorators.js';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  /**
   * Liveness probe for the load balancer and for `docker compose --wait`.
   * Deliberately does not touch the database: it answers "is this process up", not
   * "is every dependency healthy", so a database blip cannot take the whole service out
   * of rotation. A readiness probe that does check dependencies comes with L-02.
   */
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        service: { type: 'string', example: 'api' },
        version: { type: 'string', example: '0.0.0' },
        uptimeSeconds: { type: 'number', example: 12.5 },
      },
      required: ['status', 'service', 'version', 'uptimeSeconds'],
    },
  })
  check(): Health {
    return {
      status: 'ok',
      service: 'api',
      version: process.env['npm_package_version'] ?? '0.0.0',
      uptimeSeconds: Number(process.uptime().toFixed(3)),
    };
  }
}
