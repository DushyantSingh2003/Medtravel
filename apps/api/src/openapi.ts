import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import type { INestApplication } from '@nestjs/common';

/** OpenAPI document shared by the live /docs route and the export used to generate the client. */
export function buildOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('MedTravel API')
    .setDescription('REST API for the MedTravel platform')
    .setVersion('0.0.0')
    .addCookieAuth('session')
    .build();

  // cleanupOpenApiDoc turns the Zod-generated schemas into plain OpenAPI the client
  // generator can consume.
  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
}
