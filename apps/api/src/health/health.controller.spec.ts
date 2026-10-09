import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { healthSchema } from '@medtravel/contracts';
import { HealthController } from './health.controller.js';
describe('HealthController', () => {
  it('returns a payload matching the shared contract', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    const body = moduleRef.get(HealthController).check();

    expect(healthSchema.parse(body)).toMatchObject({ status: 'ok', service: 'api' });
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});
