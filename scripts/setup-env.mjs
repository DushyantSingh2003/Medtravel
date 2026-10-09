#!/usr/bin/env node
// Creates a local .env next to every .env.example that does not have one yet.
//
// The example files hold development-only defaults that match infra/docker-compose.yml,
// so a fresh clone runs with no manual editing. Existing .env files are never touched,
// and .env is gitignored, so nothing here can leak into a commit.

import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.git', '.next', 'dist', '.turbo']);

function* findExamples(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* findExamples(full);
    else if (name === '.env.example') yield full;
  }
}

let created = 0;
for (const example of findExamples(root)) {
  const target = join(dirname(example), '.env');
  if (existsSync(target)) continue;
  copyFileSync(example, target);
  created += 1;
  console.log(`created ${relative(root, target)}`);
}
console.log(created ? `${created} .env file(s) created from .env.example` : '.env files already in place');
