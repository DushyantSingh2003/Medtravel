/** 500 MiB, the largest medical file the platform accepts (PRD file service). */
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export type FileRejection = 'too_large' | 'wrong_type' | 'too_many' | 'duplicate';

export interface UploadRestrictions {
  maxFileSize: number;
  /** MIME types (`application/pdf`), wildcards (`image/*`) and extensions (`.dcm`). Empty allows all. */
  allowedFileTypes: string[];
  maxNumberOfFiles: number | null;
}

/** True when a file matches one entry of an `accept`-style list. */
export function matchesFileType(file: { name: string; type: string }, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return allowed.some((entry) => {
    const rule = entry.trim().toLowerCase();
    if (rule.startsWith('.')) return name.endsWith(rule);
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}

/** Why a file cannot be added, or `null` when it can. Checked before Uppy sees the file. */
export function rejectionFor(
  file: { name: string; size: number; type: string },
  restrictions: UploadRestrictions,
  existing: { name: string; size: number }[],
): FileRejection | null {
  if (restrictions.maxNumberOfFiles !== null && existing.length >= restrictions.maxNumberOfFiles) return 'too_many';
  if (file.size > restrictions.maxFileSize) return 'too_large';
  if (!matchesFileType(file, restrictions.allowedFileTypes)) return 'wrong_type';
  if (existing.some((other) => other.name === file.name && other.size === file.size)) return 'duplicate';
  return null;
}

/** "1.5 MB", "500 MB". Binary units (1 MB = 1024 KB) to match how operating systems report sizes. */
export function formatBytes(bytes: number, locale = 'en'): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)} ${units[unit]}`;
}
