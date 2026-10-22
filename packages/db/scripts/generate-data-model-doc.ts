import { readFileSync, writeFileSync } from 'node:fs';
import { renderDataModelDoc } from './data-model-doc.ts';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
writeFileSync(new URL('../../../docs/data-model.md', import.meta.url), renderDataModelDoc(schema));
console.warn('Wrote docs/data-model.md');
