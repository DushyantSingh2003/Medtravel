import helmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { ENV } from './config/config.module.js';
import type { Env } from './config/env.schema.js';
import { buildOpenApiDocument } from './openapi.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true, bodyLimit: 10 * 1024 * 1024 }),
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));

  const env = app.get<Env>(ENV);

  await app.register(helmet, {
    // Swagger UI needs inline styles and scripts; the API serves no other HTML.
    contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
  });

  app.enableCors({
    origin: env.CORS_ORIGINS,
    // Sessions are httpOnly cookies, so the browser must be allowed to send them.
    credentials: true,
  });

  app.enableShutdownHooks();

  SwaggerModule.setup('docs', app, buildOpenApiDocument(app), {
    swaggerOptions: { persistAuthorization: true },
  });

  // 0.0.0.0 so the container is reachable from the host.
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

await bootstrap();
