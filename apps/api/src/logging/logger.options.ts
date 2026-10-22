import { RequestMethod } from '@nestjs/common';
import type { Params } from 'nestjs-pino';
import type { Env } from '../config/env.schema.js';

/**
 * Fields scrubbed from every log line.
 *
 * This is a medical platform: request bodies and headers routinely carry credentials and
 * patient data, and logs are shipped off the box. Redaction is deliberately broad — it is
 * cheaper to lose a debugging detail than to leak a passport number.
 */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  'req.body.password',
  'req.body.currentPassword',
  'req.body.newPassword',
  'req.body.otp',
  'req.body.token',
  'req.body.challengeToken',
  'req.body.code',
  'req.body.identifier',
  'req.body.refreshToken',
  'req.body.email',
  'req.body.phone',
  'req.body.passportNumber',
  'req.body.dateOfBirth',
  '*.password',
  '*.otp',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.passportNumber',
];

/** pino configuration: pretty and chatty locally, JSON for CloudWatch in production. */
export function loggerOptions(env: Env): Params {
  const pretty = env.NODE_ENV === 'development';
  return {
    // Probes hit /health every few seconds; logging each one buries real traffic.
    exclude: [{ path: 'health', method: RequestMethod.GET }],
    pinoHttp: {
      level: env.LOG_LEVEL,
      redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
      ...(pretty ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
    },
  };
}
