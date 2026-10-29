import { describe, expect, it } from 'vitest';
import { csvCell } from './audit-csv.js';

describe('csvCell', () => {
  it('writes plain text as it is and null as nothing', () => {
    expect(csvCell('Asha')).toBe('Asha');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('quotes cells with commas, quotes or line breaks, doubling the quotes', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });

  it('puts a quote in front of anything a spreadsheet would run as a formula', () => {
    for (const bad of ['=SUM(A1)', '+1', '-1', '@cmd', '\tx'])
      expect(csvCell(bad).startsWith("'") || csvCell(bad).startsWith('"\'')).toBe(true);
    expect(csvCell('=1,2')).toBe('"\'=1,2"');
  });

  it('writes objects as JSON', () => {
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });
});
