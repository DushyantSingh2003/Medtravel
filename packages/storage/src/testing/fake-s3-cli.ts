#!/usr/bin/env node
import { FakeS3Server } from './fake-s3.js';

/** Runs the fake S3 server on `PORT` (default 9000) for local runs and CI jobs that have no MinIO. */
const port = Number(process.env['PORT'] ?? 9000);
const { url } = await new FakeS3Server().start(port);
// eslint-disable-next-line no-console
console.log(`fake S3 listening on ${url} (objects are kept in memory)`);
