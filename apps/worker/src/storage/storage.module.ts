import { Global, Module } from '@nestjs/common';
import { ObjectStore } from '@medtravel/storage';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';

/** Injection token for the private bucket. */
export const OBJECT_STORE = Symbol('OBJECT_STORE');

@Global()
@Module({
  providers: [
    {
      provide: OBJECT_STORE,
      inject: [ENV],
      useFactory: (env: Env): ObjectStore =>
        new ObjectStore({
          endpoint: env.S3_ENDPOINT,
          region: env.S3_REGION,
          accessKeyId: env.S3_ACCESS_KEY,
          secretAccessKey: env.S3_SECRET_KEY,
          bucket: env.S3_PRIVATE_BUCKET,
          forcePathStyle: env.S3_FORCE_PATH_STYLE,
        }),
    },
  ],
  exports: [OBJECT_STORE],
})
export class StorageModule {}
