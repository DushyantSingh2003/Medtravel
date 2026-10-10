import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv';

describe('csvCell', () => {
  it('leaves plain text alone', () => {
    expect(csvCell('Apollo Hospital')).toBe('Apollo Hospital');
    expect(csvCell(42)).toBe('42');
  });

  it('writes empty for null and undefined', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('quotes cells containing commas, quotes or newlines, and doubles inner quotes', () => {
    expect(csvCell('Delhi, India')).toBe('"Delhi, India"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('neutralises spreadsheet formulas (CSV injection)', () => {
    expect(csvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(csvCell('+1234')).toBe("'+1234");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`);
  });

  it('keeps Arabic text intact', () => {
    expect(csvCell('مستشفى أبولو')).toBe('مستشفى أبولو');
  });

  it('leaves negative numbers as numbers but guards negative-looking text', () => {
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell('-5')).toBe("'-5");
  });

  it('guards a formula hidden behind whitespace or control characters', () => {
    expect(csvCell('  =1+1')).toBe("'  =1+1");
    expect(csvCell('\u0001=1+1')).toBe("'\u0001=1+1");
    expect(csvCell('\t=1+1')).toBe("'\t=1+1");
  });

  it('writes an invalid date as an empty cell instead of throwing', () => {
    expect(csvCell(new Date('nope'))).toBe('');
  });

  it('serialises dates as ISO strings', () => {
    expect(csvCell(new Date('2026-01-02T03:04:05.000Z'))).toBe('2026-01-02T03:04:05.000Z');
  });
});

describe('toCsv', () => {
  it('joins rows with CRLF and puts the header first', () => {
    expect(
      toCsv(
        ['name', 'city'],
        [
          ['A', 'Delhi'],
          ['B', 'Mumbai'],
        ],
      ),
    ).toBe('name,city\r\nA,Delhi\r\nB,Mumbai');
  });
});
