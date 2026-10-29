#!/usr/bin/env node
import { FakeClamd } from './fake-clamd.js';

/** Runs the fake clamd on `PORT` (default 3310). It finds only the EICAR test string. */
const port = Number(process.env['PORT'] ?? 3310);
await new FakeClamd().start(port);
// eslint-disable-next-line no-console
console.log(`fake clamd listening on ${port} (finds only the EICAR test string)`);
