import { createServer, type Server, type Socket } from 'node:net';

export interface CapturedMail {
  from: string;
  to: string[];
  /** The message exactly as received (headers and encoded body). */
  raw: string;
  /** The Subject header, decoded. */
  subject: string;
  /** The message with transfer encodings undone, for looking for text in a test. */
  text: string;
}

function decodeQuotedPrintable(input: string): string {
  const joined = input.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i += 1) {
    if (joined[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(joined.slice(i + 1, i + 3))) {
      bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(...Buffer.from(joined[i] as string, 'utf8'));
  }
  return Buffer.from(bytes).toString('utf8');
}

function decodeHeaderWords(value: string): string {
  return value
    .replace(/\r?\n[ \t]+/g, ' ')
    .replace(/=\?UTF-8\?([BQbq])\?([^?]*)\?=/g, (_m, kind: string, data: string) =>
      kind.toUpperCase() === 'B'
        ? Buffer.from(data, 'base64').toString('utf8')
        : decodeQuotedPrintable(data.replace(/_/g, ' ')),
    )
    .replace(/\?=\s+=\?UTF-8\?[BQbq]\?/g, '');
}

/** Undoes the transfer encodings of each MIME part and joins the parts, so a test can look for text in them. */
function readableText(raw: string): string {
  const parts = raw.split(/\r?\n(?=Content-Type:|--[^\r\n]+)/i);
  return parts
    .map((part) => {
      const [head, ...rest] = part.split(/\r?\n\r?\n/);
      const body = rest.join('\n\n');
      if (/content-transfer-encoding:\s*base64/i.test(head ?? ''))
        return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
      if (/content-transfer-encoding:\s*quoted-printable/i.test(head ?? ''))
        return decodeQuotedPrintable(body);
      return part;
    })
    .join('\n');
}

/**
 * A minimal SMTP server that accepts every message and keeps it, so the real email adapter (nodemailer) can be exercised
 * without Mailpit. It speaks just enough of the protocol: EHLO, MAIL, RCPT, DATA, RSET, NOOP and QUIT. For tests and CI only.
 */
export class FakeSmtpServer {
  readonly messages: CapturedMail[] = [];
  private server: Server | undefined;
  private readonly sockets = new Set<Socket>();

  start(port = 0): Promise<{ port: number }> {
    return new Promise((resolve) => {
      this.server = createServer((socket) => this.serve(socket));
      this.server.listen(port, '127.0.0.1', () => {
        const address = this.server?.address();
        resolve({ port: typeof address === 'object' && address ? address.port : port });
      });
    });
  }

  close(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    return new Promise((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
  }

  clear(): void {
    this.messages.length = 0;
  }

  private serve(socket: Socket): void {
    this.sockets.add(socket);
    socket.on('close', () => this.sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    let buffer = '';
    let from = '';
    let to: string[] = [];
    let data: string | null = null;
    const reply = (line: string) => socket.write(`${line}\r\n`);
    reply('220 fake-smtp ESMTP ready');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      for (;;) {
        if (data !== null) {
          data += buffer;
          buffer = '';
          const end = data.indexOf('\r\n.\r\n');
          if (end === -1) return;
          buffer = data.slice(end + 5);
          data = data.slice(0, end);
          const raw = data.replace(/^\./gm, '');
          const subject = /^Subject:\s*((?:.*(?:\r?\n[ \t].*)*))/im.exec(raw)?.[1] ?? '';
          this.messages.push({
            from,
            to,
            raw,
            subject: decodeHeaderWords(subject),
            text: readableText(raw),
          });
          data = null;
          from = '';
          to = [];
          reply('250 2.0.0 queued');
          continue;
        }
        const newline = buffer.indexOf('\r\n');
        if (newline === -1) return;
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 2);
        const command = line.slice(0, 4).toUpperCase();
        if (command === 'EHLO' || command === 'HELO') {
          socket.write('250-fake-smtp\r\n250 8BITMIME\r\n');
        } else if (/^MAIL FROM:/i.test(line)) {
          from = /<([^>]*)>/.exec(line)?.[1] ?? '';
          reply('250 2.1.0 ok');
        } else if (/^RCPT TO:/i.test(line)) {
          to.push(/<([^>]*)>/.exec(line)?.[1] ?? '');
          reply('250 2.1.5 ok');
        } else if (command === 'DATA') {
          data = '';
          reply('354 end with <CRLF>.<CRLF>');
        } else if (command === 'RSET' || command === 'NOOP') {
          from = '';
          to = [];
          reply('250 ok');
        } else if (command === 'QUIT') {
          socket.end('221 bye\r\n');
          return;
        } else reply('502 command not implemented');
      }
    });
  }
}
