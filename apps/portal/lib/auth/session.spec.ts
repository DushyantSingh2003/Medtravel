import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cookieStore = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    has: (name: string) => cookieStore.has(name),
    toString: () => [...cookieStore].map(([k, v]) => `${k}=${v}`).join('; '),
  }),
}));

/** The real `redirect` never returns; the stand-in throws so a guard that forgets to stop is caught. */
vi.mock('../../i18n/navigation', () => ({
  redirect: ({ href, locale }: { href: string; locale: string }) => {
    throw new Error(`REDIRECT ${locale} ${href}`);
  },
}));

const user = (over: Record<string, unknown> = {}) => ({
  id: '3f2b1c3e-0a7d-4f0e-9a52-1d2b7a6c9e10',
  name: 'Dev',
  email: 'dev@example.com',
  role: 'case_manager',
  language: 'en',
  emailVerified: true,
  twoFactorEnabled: true,
  twoFactorRequired: true,
  access: 'full',
  scopeCaseId: null,
  ...over,
});

const answer = (status: number, body: unknown = {}) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }));

const load = () => import('./session');

describe('session', () => {
  beforeEach(() => {
    cookieStore.clear();
    vi.resetModules();
  });
  afterEach(() => vi.restoreAllMocks());

  it('is null without an access cookie, and then asks nobody', async () => {
    const spy = answer(200, user());
    const { getSession } = await load();
    expect(await getSession()).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('asks the API who it is, forwarding the cookies, and works out the portal from the role', async () => {
    cookieStore.set('mt_at', 'token');
    cookieStore.set('mt_csrf', 'x');
    const spy = answer(200, user({ role: 'doctor' }));
    const { getSession } = await load();
    expect(await getSession()).toMatchObject({ role: 'doctor', portal: 'hospital' });
    const [url, init] = spy.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://localhost:3001/auth/me');
    expect((init?.headers as Record<string, string>)['cookie']).toBe('mt_at=token; mt_csrf=x');
  });

  it('is null when the API says the session is over, answers nonsense, or is down', async () => {
    cookieStore.set('mt_at', 'token');
    for (const respond of [() => answer(401), () => answer(200, { role: 'root' }), () => vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'))]) {
      vi.restoreAllMocks();
      vi.resetModules();
      respond();
      const { getSession } = await load();
      expect(await getSession()).toBeNull();
    }
  });

  it('sends signed-out visitors to the login page from every portal', async () => {
    const { requirePortalSession } = await load();
    for (const portal of ['patient', 'ops', 'hospital', 'agent', 'admin'] as const) {
      await expect(requirePortalSession('en', portal)).rejects.toThrow('REDIRECT en /login');
    }
  });

  it('sends a user to their own portal, and a limited session to the two-factor set-up', async () => {
    cookieStore.set('mt_at', 'token');
    answer(200, user({ role: 'case_manager' }));
    let { requirePortalSession } = await load();
    await expect(requirePortalSession('en', 'admin')).rejects.toThrow('REDIRECT en /ops');
    await expect(requirePortalSession('en', 'ops')).resolves.toMatchObject({ portal: 'ops' });

    vi.restoreAllMocks();
    vi.resetModules();
    answer(200, user({ access: 'two_factor_setup' }));
    ({ requirePortalSession } = await load());
    await expect(requirePortalSession('en', 'ops')).rejects.toThrow('REDIRECT en /two-factor/setup');
  });

  it('keeps the account pages for full sessions, and the set-up page for any', async () => {
    cookieStore.set('mt_at', 'token');
    answer(200, user({ access: 'two_factor_setup' }));
    const { requireAccountSession, requireAnySession } = await load();
    await expect(requireAccountSession('ar')).rejects.toThrow('REDIRECT ar /two-factor/setup');
    await expect(requireAnySession('ar')).resolves.toMatchObject({ role: 'case_manager' });
  });
});
