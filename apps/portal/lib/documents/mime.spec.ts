import { describe, expect, it } from 'vitest';
import { mimeOf, previewKind } from './mime';

describe('mimeOf', () => {
  it('keeps the type the browser reports', () => {
    expect(mimeOf('a.pdf', 'application/pdf')).toBe('application/pdf');
  });

  it('falls back to the extension when the browser reports nothing', () => {
    expect(mimeOf('Scan.HEIC', '')).toBe('image/heic');
    expect(mimeOf('study.zip', '')).toBe('application/zip');
    expect(mimeOf('x.docx', '')).toContain('wordprocessingml');
    expect(mimeOf('x.unknown', '')).toBe('application/octet-stream');
  });
});

describe('previewKind', () => {
  it('shows images and PDFs, and nothing else', () => {
    expect(previewKind('image/png')).toBe('image');
    expect(previewKind('application/pdf')).toBe('pdf');
    expect(previewKind('image/heic')).toBe('none');
    expect(previewKind('application/zip')).toBe('none');
  });
});
