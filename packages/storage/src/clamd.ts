import { connect } from 'node:net';
import type { Readable } from 'node:stream';

export interface ClamdOptions {
  host: string;
  port: number;
  /** Gives up when the scanner is silent this long (ms). */
  timeoutMs?: number;
}

export type ScanVerdict = { clean: true } | { clean: false; signature: string };

const CHUNK = 64 * 1024;

/**
 * Scans a stream with ClamAV's `clamd` over TCP (the `INSTREAM` command): the file is sent in length-prefixed chunks and
 * never held in memory. Rejects when the scanner cannot be reached, says ERROR, or does not answer; the caller retries.
 */
/** The scanner refused the file because it is larger than it is set up to read; retrying cannot help. */
export class ScanLimitError extends Error {
  constructor() {
    super('The file is larger than the virus scanner will read');
    this.name = 'ScanLimitError';
  }
}

export function scanStream(stream: Readable, options: ClamdOptions): Promise<ScanVerdict> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: options.host, port: options.port });
    const answer: Buffer[] = [];
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      stream.destroy();
      action();
    };
    socket.setTimeout(options.timeoutMs ?? 120_000, () =>
      finish(() => reject(new Error('The virus scanner timed out'))),
    );
    socket.on('error', (error) => finish(() => reject(error)));
    socket.on('data', (data) => answer.push(data));
    socket.on('close', () => {
      if (settled) return;
      const text = Buffer.concat(answer).toString('utf8').replace(/\0/g, '').trim();
      settled = true;
      stream.destroy();
      if (/\bOK$/.test(text)) return resolve({ clean: true });
      const found = /^stream: (.+) FOUND$/.exec(text);
      if (found?.[1]) return resolve({ clean: false, signature: found[1] });
      if (/size limit exceeded/i.test(text)) return reject(new ScanLimitError());
      reject(
        new Error(`The virus scanner gave an unexpected answer: ${text.slice(0, 120) || '(none)'}`),
      );
    });

    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      stream.on('data', (chunk: Buffer) => {
        for (let offset = 0; offset < chunk.length; offset += CHUNK) {
          const part = chunk.subarray(offset, offset + CHUNK);
          const header = Buffer.alloc(4);
          header.writeUInt32BE(part.length, 0);
          if (!socket.write(Buffer.concat([header, part]))) {
            stream.pause();
            socket.once('drain', () => stream.resume());
          }
        }
      });
      stream.on('end', () => socket.write(Buffer.alloc(4)));
      stream.on('error', (error) => finish(() => reject(error)));
    });
  });
}
