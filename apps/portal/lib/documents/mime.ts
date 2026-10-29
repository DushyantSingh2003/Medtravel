import { DOCUMENT_TYPES } from '@medtravel/contracts';

/**
 * The MIME type to announce for a file. Browsers report an empty type for some of them (HEIC, ZIP archives of scans), so fall
 * back to the extension; the API checks the pair and the worker checks the content.
 */
export function mimeOf(fileName: string, reported: string): string {
  if (reported) return reported;
  const name = fileName.toLowerCase();
  const match = DOCUMENT_TYPES.find((type) => name.endsWith(type.extension));
  return match?.mimeTypes[0] ?? 'application/octet-stream';
}

/** How a preview shows a file: as an image, in a PDF frame, or not at all. */
export function previewKind(mimeType: string): 'image' | 'pdf' | 'none' {
  if (mimeType === 'image/jpeg' || mimeType === 'image/png') return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'none';
}
