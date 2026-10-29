import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import sharp from 'sharp';

/** What the first bytes of a file say it is. DOCX and ZIP share one signature, as do all ZIP-based formats. */
export type SniffedType = 'pdf' | 'jpeg' | 'png' | 'heic' | 'zip';

export function sniffFileType(head: Uint8Array): SniffedType | null {
  const b = head;
  if (
    b.length >= 5 &&
    b[0] === 0x25 &&
    b[1] === 0x50 &&
    b[2] === 0x44 &&
    b[3] === 0x46 &&
    b[4] === 0x2d
  )
    return 'pdf';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  )
    return 'png';
  if (
    b.length >= 4 &&
    b[0] === 0x50 &&
    b[1] === 0x4b &&
    (b[2] === 0x03 || b[2] === 0x05) &&
    (b[3] === 0x04 || b[3] === 0x06)
  )
    return 'zip';
  // HEIC/HEIF: an ISO box `ftyp` at byte 4 with a heic-family brand.
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8] ?? 0, b[9] ?? 0, b[10] ?? 0, b[11] ?? 0);
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heim', 'heis'].includes(brand))
      return 'heic';
  }
  return null;
}

const ZIP_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/x-zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  // Some browsers report nothing useful for a DICOM archive.
  'application/octet-stream',
]);

/** Whether the declared MIME type is consistent with what the content really is. */
export function matchesDeclaredType(declared: string, sniffed: SniffedType | null): boolean {
  const type = declared.toLowerCase();
  switch (sniffed) {
    case 'pdf':
      return type === 'application/pdf';
    case 'jpeg':
      return type === 'image/jpeg' || type === 'image/jpg';
    case 'png':
      return type === 'image/png';
    case 'heic':
      return type === 'image/heic' || type === 'image/heif';
    case 'zip':
      return ZIP_TYPES.has(type);
    default:
      return false;
  }
}

export async function pdfPageCount(pdf: Uint8Array): Promise<number> {
  const document = await PDFDocument.load(pdf, { ignoreEncryption: true, updateMetadata: false });
  return document.getPageCount();
}

/** A 320 px wide-or-high WebP preview of a JPEG or PNG. */
export function makeThumbnail(image: Uint8Array): Promise<Buffer> {
  return sharp(image, { failOn: 'error' })
    .rotate()
    .resize(320, 320, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer();
}

/** The text on a watermark: who looked, when, and which case. Single line, no control characters. */
export function watermarkText(viewerName: string, date: Date, caseNo: string | null): string {
  const clean = (value: string) =>
    value
      .replace(/\p{Cc}/gu, ' ')
      .trim()
      .slice(0, 60);
  return `${clean(viewerName)} | ${date.toISOString().slice(0, 10)} | ${caseNo ? clean(caseNo) : '-'}`;
}

/** PDF with the watermark repeated diagonally on every page. Text outside Latin-1 is shown as `?`, as the built-in fonts require. */
export async function watermarkPdf(pdf: Uint8Array, text: string): Promise<Buffer> {
  const document = await PDFDocument.load(pdf, { ignoreEncryption: true, updateMetadata: false });
  const font = await document.embedFont(StandardFonts.HelveticaBold);
  const safe = text.replace(/[^\u0020-\u007e\u00a1-\u00ff]/g, '?');
  for (const page of document.getPages()) {
    const { width, height } = page.getSize();
    const size = Math.max(10, Math.min(width, height) / 32);
    const step = size * 9;
    for (let y = -height; y < height * 2; y += step) {
      page.drawText(safe, {
        x: width * 0.08,
        y,
        size,
        font,
        color: rgb(0.5, 0.5, 0.5),
        opacity: 0.18,
        rotate: degrees(30),
      });
    }
  }
  return Buffer.from(await document.save());
}

const escapeXml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** JPEG or PNG with the watermark written across it. Keeps the format. */
export async function watermarkImage(
  image: Uint8Array,
  format: 'jpeg' | 'png',
  text: string,
): Promise<Buffer> {
  const base = sharp(image, { failOn: 'error' }).rotate();
  const { width = 0, height = 0 } = await base
    .clone()
    .metadata()
    .then((m) => {
      // After rotate() the displayed size may swap; read it from the actual pipeline output.
      return { width: m.autoOrient?.width ?? m.width, height: m.autoOrient?.height ?? m.height };
    });
  const size = Math.max(14, Math.round(Math.min(width, height) / 22));
  const lines: string[] = [];
  for (let y = size * 2; y < height + width; y += size * 6) {
    lines.push(
      `<text x="0" y="${y}" transform="rotate(-25 0 ${y})" font-family="Helvetica, Arial, sans-serif" font-size="${size}" font-weight="bold" fill="white" fill-opacity="0.55" stroke="black" stroke-opacity="0.35" stroke-width="1">${escapeXml(text)}</text>`,
    );
  }
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${lines.join('')}</svg>`,
  );
  const composed = base.composite([{ input: svg, top: 0, left: 0 }]);
  return format === 'png' ? composed.png().toBuffer() : composed.jpeg({ quality: 88 }).toBuffer();
}
