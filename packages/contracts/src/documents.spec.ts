import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_MAX_BYTES,
  MULTIPART_MIN_PART_BYTES,
  UPLOAD_KEY_PATTERN,
  isAllowedUpload,
  maxPartsFor,
  signUploadRequestSchema,
  updateDocumentSchema,
} from './documents.js';

describe('isAllowedUpload', () => {
  it('allows PDF, JPG, PNG, HEIC, DOCX and ZIP with a matching type', () => {
    for (const [name, type] of [
      ['report.pdf', 'application/pdf'],
      ['scan.JPG', 'image/jpeg'],
      ['scan.jpeg', 'image/jpeg'],
      ['photo.png', 'image/png'],
      ['photo.heic', 'image/heic'],
      ['letter.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      ['dicom.zip', 'application/zip'],
      ['dicom.zip', 'application/octet-stream'],
    ] as const)
      expect(isAllowedUpload(name, type), name).toBe(true);
  });

  it('refuses everything else, and a name that disagrees with the type', () => {
    for (const [name, type] of [
      ['run.exe', 'application/octet-stream'],
      ['page.html', 'text/html'],
      ['script.js', 'text/javascript'],
      ['report.pdf', 'image/png'],
      ['photo.png', 'application/pdf'],
      ['noextension', 'application/pdf'],
      ['archive.7z', 'application/x-7z-compressed'],
    ] as const)
      expect(isAllowedUpload(name, type), name).toBe(false);
  });

  it('offers the uploader both types and extensions', () => {
    expect(DOCUMENT_ACCEPT).toEqual(
      expect.arrayContaining(['application/pdf', '.pdf', '.zip', 'image/png']),
    );
  });
});

describe('maxPartsFor', () => {
  it('allows as many parts as the smallest part size lets a file have', () => {
    expect(maxPartsFor(1)).toBe(1);
    expect(maxPartsFor(MULTIPART_MIN_PART_BYTES)).toBe(1);
    expect(maxPartsFor(MULTIPART_MIN_PART_BYTES + 1)).toBe(2);
    expect(maxPartsFor(DOCUMENT_MAX_BYTES)).toBe(100);
  });
});

describe('upload keys and signing requests', () => {
  it('accepts only keys the API would mint', () => {
    expect(UPLOAD_KEY_PATTERN.test('files/3f0c6f1e-9b1a-4c55-8a53-0d2f5c0a1b11')).toBe(true);
    for (const bad of [
      '../files/x',
      'files/../../etc',
      'files/abc',
      'other/3f0c6f1e-9b1a-4c55-8a53-0d2f5c0a1b11',
      'files/3f0c6f1e-9b1a-4c55-8a53-0d2f5c0a1b11/x',
    ])
      expect(UPLOAD_KEY_PATTERN.test(bad), bad).toBe(false);
  });

  it('validates a request to start an upload', () => {
    const base = { request: { method: 'POST' as const, key: 'files/x' } };
    const file = { fileName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 10 };
    expect(signUploadRequestSchema.safeParse({ ...base, file }).success).toBe(true);
    expect(
      signUploadRequestSchema.safeParse({ ...base, file: { ...file, sizeBytes: 0 } }).success,
    ).toBe(false);
    expect(
      signUploadRequestSchema.safeParse({
        ...base,
        file: { ...file, sizeBytes: DOCUMENT_MAX_BYTES + 1 },
      }).success,
    ).toBe(false);
    expect(
      signUploadRequestSchema.safeParse({ ...base, file: { ...file, fileName: '../a.pdf' } })
        .success,
    ).toBe(false);
    expect(
      signUploadRequestSchema.safeParse({
        request: { method: 'PUT', key: 'files/x', partNumber: 0 },
      }).success,
    ).toBe(false);
  });

  it('lets a document be updated only in its kind, type and notes', () => {
    expect(updateDocumentSchema.safeParse({ notes: 'x' }).success).toBe(true);
    expect(updateDocumentSchema.safeParse({ scanStatus: 'clean' }).success).toBe(false);
    expect(updateDocumentSchema.safeParse({ storageKey: 'x' }).success).toBe(false);
  });
});
