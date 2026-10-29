#!/usr/bin/env node
import { FakeSmtpServer } from './fake-smtp.js';

/** `fake-smtp [port]`: an SMTP sink for the browser tests in CI, where Mailpit is not available. Prints each subject it receives. */
const server = new FakeSmtpServer();
const port = Number(process.argv[2] ?? process.env['PORT'] ?? 1025);
const { port: listening } = await server.start(port);
process.stdout.write(`fake SMTP listening on ${listening}\n`);

let seen = 0;
setInterval(() => {
  for (const mail of server.messages.slice(seen))
    process.stdout.write(`mail to ${mail.to.join(',')}: ${mail.subject}\n`);
  seen = server.messages.length;
}, 500).unref();

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => void server.close().then(() => process.exit(0)));
