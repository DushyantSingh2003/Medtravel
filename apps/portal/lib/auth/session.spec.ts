import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cookieStore = new Map<string, string>();
const setSpy = vi.fn((name: string, value: string) => void cookieStore.set(name, value));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieStore.has(name) ? { name, value: cookieStore.get(name) } : undefined,
    set: setSpy,
    delete: (name: string) => cookieStore.delete(name),
  }),
}));

/** The real `redirect` never returns; the stand-in throws so a guard that forgets to stop is caught. */
vi.mock('../../i18n/navigation', () => ({
  redirect: ({ href, locale }: { href: string; locale: string }) => {
    throw new Error(`REDIRECT ${locale} ${href}`);
  },
}));

const loadSession = () => import('./session');

describe('stub session', () => {
  beforeEach(() => {
    cookieStore.clear();
    setSpy.mockClear();
    vi.resetModules();
  });
  afterEach(() => vi.unstubAllEnvs());

  describe('with the flag unset (every deployed environment)', () => {
    beforeEach(() => vi.stubEnv('ENABLE_STUB_AUTH', ''));

    it('ignores even a valid session cookie', async () => {
      cookieStore.set('mt_stub_session', 'super_admin');
      const { getSession } = await loadSession();
      expect(await getSession()).toBeNull();
    });

    it('refuses to create a session', async () => {
      const { createSession } = await loadSession();
      await expect(createSession('super_admin')).rejects.toThrow('switched off');
      expect(setSpy).not.toHaveBeenCalled();
    });

    it('sends every portal request to the login page, whatever cookie it carries', async () => {
      cookieStore.set('mt_stub_session', 'super_admin');
      const { requirePortalSession } = await loadSession();
      for (const portal of ['patient', 'ops', 'hospital', 'agent', 'admin'] as const) {
        await expect(requirePortalSession('en', portal)).rejects.toThrow('REDIRECT en /login');
      }
    });
  });

  describe('with the flag on (development and CI)', () => {
    beforeEach(() => vi.stubEnv('ENABLE_STUB_AUTH', 'true'));

    it('reads the role and its portal from the cookie', async () => {
      cookieStore.set('mt_stub_session', 'doctor');
      const { getSession } = await loadSession();
      expect(await getSession()).toEqual({ role: 'doctor', portal: 'hospital' });
    });

    it('treats a missing or unknown cookie as signed out', async () => {
      const { getSession } = await loadSession();
      expect(await getSession()).toBeNull();
      vi.resetModules();
      cookieStore.set('mt_stub_session', 'root');
      const again = await loadSession();
      expect(await again.getSession()).toBeNull();
    });

    it('creates an httpOnly, same-site session cookie holding only the role', async () => {
      const { createSession } = await loadSession();
      await createSession('finance');
      expect(setSpy).toHaveBeenCalledWith(
        'mt_stub_session',
        'finance',
        expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
      );
    });

    it('lets a user into their own portal and sends everyone else to theirs', async () => {
      cookieStore.set('mt_stub_session', 'case_manager');
      const { requirePortalSession } = await loadSession();
      await expect(requirePortalSession('en', 'ops')).resolves.toEqual({
        role: 'case_manager',
        portal: 'ops',
      });
      await expect(requirePortalSession('ar', 'admin')).rejects.toThrow('REDIRECT ar /ops');
      await expect(requirePortalSession('en', 'patient')).rejects.toThrow('REDIRECT en /ops');
    });

    it('sends a signed-out visitor to the login page in their language', async () => {
      const { requirePortalSession } = await loadSession();
      await expect(requirePortalSession('ar', 'ops')).rejects.toThrow('REDIRECT ar /login');
    });
  });
});
