import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BYTES, formatBytes, matchesFileType, rejectionFor } from './files';

const pdf = { name: 'report.pdf', size: 1000, type: 'application/pdf' };

describe('matchesFileType', () => {
  it('allows everything when the list is empty', () => {
    expect(matchesFileType(pdf, [])).toBe(true);
  });
  it('matches exact MIME types, wildcards and extensions', () => {
    expect(matchesFileType(pdf, ['application/pdf'])).toBe(true);
    expect(matchesFileType({ name: 'a.png', size: 1, type: 'image/png' }, ['image/*'])).toBe(true);
    expect(matchesFileType({ name: 'scan.DCM', size: 1, type: '' }, ['.dcm'])).toBe(true);
  });
  it('rejects other types', () => {
    expect(matchesFileType(pdf, ['image/*', '.dcm'])).toBe(false);
    expect(
      matchesFileType({ name: 'a.exe', size: 1, type: 'application/x-msdownload' }, [
        'application/pdf',
      ]),
    ).toBe(false);
  });
  it('does not let a wildcard match a different family', () => {
    expect(
      matchesFileType({ name: 'a.svg', size: 1, type: 'application/svg+xml' }, ['image/*']),
    ).toBe(false);
  });
});

describe('rejectionFor', () => {
  const rules = {
    maxFileSize: MAX_UPLOAD_BYTES,
    allowedFileTypes: ['application/pdf'],
    maxNumberOfFiles: 2,
  };

  it('accepts a valid file', () => {
    expect(rejectionFor(pdf, rules, [])).toBeNull();
  });
  it('rejects a file over the size limit but accepts one exactly at it', () => {
    expect(rejectionFor({ ...pdf, size: MAX_UPLOAD_BYTES + 1 }, rules, [])).toBe('too_large');
    expect(rejectionFor({ ...pdf, size: MAX_UPLOAD_BYTES }, rules, [])).toBeNull();
  });
  it('rejects a disallowed type', () => {
    expect(rejectionFor({ name: 'a.zip', size: 1, type: 'application/zip' }, rules, [])).toBe(
      'wrong_type',
    );
  });
  it('rejects beyond the file count and duplicates', () => {
    expect(
      rejectionFor(pdf, rules, [
        { name: 'a.pdf', size: 1 },
        { name: 'b.pdf', size: 2 },
      ]),
    ).toBe('too_many');
    expect(rejectionFor(pdf, rules, [{ name: 'report.pdf', size: 1000 }])).toBe('duplicate');
    expect(rejectionFor({ ...pdf, size: 0 }, rules, [])).toBe('empty');
  });
  it('allows any number of files when no count limit is set', () => {
    expect(
      rejectionFor(
        pdf,
        { ...rules, maxNumberOfFiles: null },
        Array.from({ length: 50 }, (_, i) => ({ name: `f${i}`, size: i })),
      ),
    ).toBeNull();
  });
});

describe('formatBytes', () => {
  it('formats with binary units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(500 * 1024 * 1024)).toBe('500 MB');
    expect(formatBytes(5 * 1024 ** 3)).toBe('5 GB');
  });

  it('uses Latin digits in Arabic and accepts translated unit symbols', () => {
    expect(formatBytes(1536, 'ar', ['ب', 'ك.ب', 'م.ب', 'ج.ب'])).toBe('1.5 ك.ب');
    expect(formatBytes(-5)).toBe('0 B');
  });
});
