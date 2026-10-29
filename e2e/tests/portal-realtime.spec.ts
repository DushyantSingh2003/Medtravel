import { expect, test, type Page } from '@playwright/test';
import { signInAs } from './support/auth.js';

/**
 * Realtime from the browser (F-08): two people are signed in at once in two browsers. One of them (the admin) sends a
 * notification to the other; it shows up in the other's open bell with no reload. Needs the API (with the realtime gateway),
 * Redis and the worker (which pushes the event after the change has committed).
 */

const API = process.env['API_BASE_URL'] ?? 'http://localhost:3001';
const bell = (page: Page) => page.getByRole('button', { name: /^Notifications/ });

async function csrf(page: Page): Promise<string> {
  return (await page.context().cookies()).find((c) => c.name === 'mt_csrf')?.value ?? '';
}

test('a notification sent in one browser appears in the other browser’s bell without a reload', async ({
  browser,
}) => {
  const patientContext = await browser.newContext();
  const patient = await patientContext.newPage();
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();

  // The patient's page must have its realtime connection open before the admin sends.
  const socketOpened = patient.waitForEvent('websocket', (socket) =>
    socket.url().includes('/realtime'),
  );
  await signInAs(patient, 'patient');
  await socketOpened;
  await signInAs(admin, 'super_admin');

  const me = await patient.request.get(`${API}/auth/me`);
  const patientId = ((await me.json()) as { id: string }).id;
  const countUnread = async () =>
    Number(
      /(\d+) unread/.exec(
        (await bell(patient).getAttribute('aria-label')) ?? (await bell(patient).innerText()),
      )?.[1] ?? 0,
    );
  const before = await countUnread();

  const sent = await admin.request.post(`${API}/notifications/test`, {
    headers: { 'x-csrf-token': await csrf(admin) },
    data: { userId: patientId, channels: ['in_app'] },
  });
  expect(sent.ok()).toBe(true);

  // No reload, no navigation: the count rises by itself (the bell's own poll is five minutes, so this is the push).
  await expect(async () => expect(await countUnread()).toBe(before + 1)).toPass({
    timeout: 15_000,
  });
  await bell(patient).click();
  await expect(patient.getByRole('button', { name: /Test notification/ }).first()).toBeVisible();

  await patientContext.close();
  await adminContext.close();
});

test('a browser without a session cannot hold a realtime connection', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/en/login');
  const result = await page.evaluate(
    (api) =>
      new Promise<string>((resolve) => {
        const ws = new WebSocket(
          `${api.replace('http', 'ws')}/realtime/?EIO=4&transport=websocket`,
        );
        // Engine.IO opens with a "0{...}" packet; the client then asks to join the default namespace with "40".
        ws.onopen = () => ws.send('40');
        ws.onmessage = (event) => {
          // Socket.IO answers the handshake with a CONNECT_ERROR packet ("44...") when the session is missing.
          if (String(event.data).startsWith('44')) resolve('refused');
          if (String(event.data).startsWith('40')) resolve('connected');
        };
        ws.onerror = () => resolve('refused');
        ws.onclose = () => resolve('refused');
        setTimeout(() => resolve('timeout'), 8000);
      }),
    API,
  );
  expect(result).toBe('refused');
  await context.close();
});
