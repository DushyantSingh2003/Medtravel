// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CLAUDE.md: "RTL-safe Tailwind only: ms-/me-/ps-/pe-/start-/end-, never ml-/mr-/pl-/pr-/left-/right-".
 * Physical-direction utilities silently break the Arabic layout, so this scans every component and
 * every app page for them. Logical utilities (ms-2, pe-3, start-0, text-start, rounded-s...) are fine.
 */
const root = join(__dirname, '..', '..', '..');
const SCAN = ['packages/ui/src', 'apps/web/app', 'apps/portal/app'];
const BANNED =
  /(?<![\w-])(?:[\w-]+:)*-?(?:(?:ml|mr|pl|pr|left|right|inset-l|inset-r|scroll-ml|scroll-mr|scroll-pl|scroll-pr)-[\w[\]./%()-]+|text-(?:left|right)|float-(?:left|right)|clear-(?:left|right)|rounded-(?:l|r|tl|tr|bl|br)(?:-[\w[\]./%()-]+)?|border-(?:l|r)(?:-[\w[\]./%()-]+)?|space-x-reverse)(?![\w-])/g;

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* files(full);
    else if (/\.(tsx|css)$/.test(name) && !/\.spec\./.test(name)) yield full;
  }
}

describe('RTL-safe styling', () => {
  it('uses no physical left/right utilities in components or pages', () => {
    const offenders: string[] = [];
    for (const dir of SCAN) {
      for (const file of files(join(root, dir))) {
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, index) => {
          // Skip comments that merely mention the rule.
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
          for (const match of line.matchAll(BANNED)) {
            offenders.push(`${relative(root, file)}:${index + 1}  ${match[0]}`);
          }
        });
      }
    }
    expect(offenders).toEqual([]);
  });

  it('actually catches physical utilities (guards the guard)', () => {
    for (const bad of ['ml-2', 'sm:pr-4', '-mr-1', 'left-0', 'text-right', 'rounded-l-md', 'border-r', 'md:right-3']) {
      expect(bad.match(BANNED), bad).not.toBeNull();
    }
    for (const good of ['ms-2', 'sm:pe-4', '-me-1', 'start-0', 'text-end', 'rounded-s-md', 'border-e', 'md:end-3', 'mt-2', 'px-3']) {
      expect(good.match(BANNED), good).toBeNull();
    }
  });
});

/**
 * Colours must come from the semantic tokens (bg-background, text-muted-foreground, border-border...)
 * so a theme change, dark mode included, reaches every screen. A hard-coded neutral such as bg-white
 * or text-slate-900 stays the same in every theme and breaks dark mode.
 */
const HARD_CODED_COLOUR =
  /(?<![\w-])(?:[\w-]+:)*(?:bg|text|border|ring|divide|outline|fill|stroke|from|to|via)-(?:white|black|(?:slate|gray|zinc|neutral|stone)-\d{2,3})(?:\/\d+)?(?![\w-])/g;

describe('theme-safe colours', () => {
  it('uses semantic colour tokens, not hard-coded neutrals, in components and pages', () => {
    const offenders: string[] = [];
    for (const dir of SCAN) {
      for (const file of files(join(root, dir))) {
        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, index) => {
            if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
            for (const match of line.matchAll(HARD_CODED_COLOUR)) {
              // Dialog and drawer scrims are black at 50% in every theme on purpose.
              if (/^bg-black\/\d+$/.test(match[0])) continue;
              offenders.push(`${relative(root, file)}:${index + 1}  ${match[0]}`);
            }
          });
      }
    }
    expect(offenders).toEqual([]);
  });

  it('actually catches hard-coded colours (guards the guard)', () => {
    for (const bad of ['bg-white', 'text-slate-900', 'dark:bg-gray-800', 'border-zinc-200']) {
      expect(bad.match(HARD_CODED_COLOUR), bad).not.toBeNull();
    }
    for (const good of ['bg-background', 'text-muted-foreground', 'border-border', 'bg-primary/90', 'text-brand-800']) {
      expect(good.match(HARD_CODED_COLOUR), good).toBeNull();
    }
  });
});
