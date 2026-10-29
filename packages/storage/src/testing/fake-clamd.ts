import { createServer, type Server } from 'node:net';
import type { AddressInfo } from 'node:net';

/** The standard anti-virus test string; every scanner flags it, and it is harmless. */
export const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

/**
 * A stand-in for ClamAV's `clamd` that speaks the `INSTREAM` protocol: it reads the length-prefixed chunks, and answers
 * `stream: OK` or `stream: Eicar-Test-Signature FOUND` when the EICAR string appears anywhere in the stream. For tests and
 * for running the platform without the ClamAV container; it detects nothing else.
 */
export class FakeClamd {
  private server: Server | undefined;
  /** When set, every scan fails like an overloaded scanner. */
  failing = false;
  scans = 0;

  async start(port = 0): Promise<{ port: number }> {
    this.server = createServer((socket) => {
      let pending = Buffer.alloc(0);
      let streaming = false;
      let tail = Buffer.alloc(0);
      let found = false;
      socket.on('error', () => undefined);
      socket.on('data', (data) => {
        pending = Buffer.concat([pending, data]);
        if (!streaming) {
          const end = pending.indexOf(0);
          const newline = pending.indexOf(10);
          const stop = end >= 0 ? end : newline;
          if (stop < 0) return;
          const command = pending.subarray(0, stop).toString('ascii').replace(/^[zn]/, '');
          pending = pending.subarray(stop + 1);
          if (command === 'PING') {
            socket.end('PONG\0');
            return;
          }
          if (command !== 'INSTREAM') {
            socket.end('UNKNOWN COMMAND\0');
            return;
          }
          if (this.failing) {
            socket.end('INSTREAM size limit exceeded. ERROR\0');
            return;
          }
          streaming = true;
          this.scans += 1;
        }
        while (pending.length >= 4) {
          const length = pending.readUInt32BE(0);
          if (length === 0) {
            socket.end(found ? 'stream: Eicar-Test-Signature FOUND\0' : 'stream: OK\0');
            return;
          }
          if (pending.length < 4 + length) return;
          const chunk = pending.subarray(4, 4 + length);
          pending = pending.subarray(4 + length);
          const window = Buffer.concat([tail, chunk]);
          if (window.includes(EICAR)) found = true;
          tail = window.subarray(Math.max(0, window.length - EICAR.length));
        }
      });
    });
    await new Promise<void>((resolve) => this.server?.listen(port, '127.0.0.1', resolve));
    return { port: (this.server?.address() as AddressInfo).port };
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) =>
      this.server ? this.server.close(() => resolve()) : resolve(),
    );
  }
}
