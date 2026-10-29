import helmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { ENV } from './config/config.module.js';
import { loadEnv, type Env } from './config/env.schema.js';
import { RealtimeAdapter } from './realtime/realtime.adapter.js';
import { buildOpenApiDocument } from './openapi.js';

async function bootstrap(): Promise<void> {
  // Read before the app exists: how many proxies to trust decides how the client address is worked out, which the
  // rate limiter and the audit trail rely on. `true` would trust anything a client puts in X-Forwarded-For.
  const { TRUST_PROXY_HOPS } = loadEnv();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      trustProxy: (_address: string, hop: number) => hop < TRUST_PROXY_HOPS,
      bodyLimit: 10 * 1024 * 1024,
    }),
    { bufferLogs: true, rawBody: true },
  );

  app.useLogger(app.get(Logger));

  const env = app.get<Env>(ENV);

  await app.register(helmet, {
    // Swagger UI needs inline styles and scripts; the API serves no other HTML.
    contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
  });

  app.enableCors({
    origin: env.CORS_ORIGINS,
    // The default allows only GET, HEAD and POST, which would make the browser refuse every PATCH and DELETE.
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    // Sessions are httpOnly cookies, so the browser must be allowed to send them.
    credentials: true,
  });

  app.useWebSocketAdapter(new RealtimeAdapter(app, env));

  app.enableShutdownHooks();

  // The API description and the "try it" page are for development and CI; a deployed API does not publish them.
  if (env.NODE_ENV !== 'production') {
    SwaggerModule.setup('docs', app, buildOpenApiDocument(app), {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // 0.0.0.0 so the container is reachable from the host.
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

await bootstrap();
