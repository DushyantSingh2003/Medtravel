import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { permissionsMarkdown } from '../src/permissions-doc.ts';

const target = fileURLToPath(new URL('../../../docs/permissions.md', import.meta.url));
writeFileSync(target, permissionsMarkdown());
console.log(`Wrote ${target}`);
