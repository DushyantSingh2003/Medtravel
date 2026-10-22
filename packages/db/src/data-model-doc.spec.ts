import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderDataModelDoc } from '../scripts/data-model-doc.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('docs/data-model.md', () => {
  const schema = read('../prisma/schema.prisma');

  it('is up to date with the schema (run `pnpm --filter @medtravel/db docs:model` after changing it)', () => {
    expect(read('../../../docs/data-model.md')).toBe(renderDataModelDoc(schema));
  });

  it('lists every entity of the schema', () => {
    const doc = read('../../../docs/data-model.md');
    for (const match of schema.matchAll(/^model (\w+) \{/gm)) {
      expect(doc, match[1]).toContain(`**${match[1]}**`);
    }
  });
});
