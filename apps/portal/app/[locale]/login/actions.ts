'use server';

import { isRole, portalOfRole } from '@medtravel/contracts';
import { isLocale } from '@medtravel/i18n';
import { redirect } from '../../../i18n/navigation';
import { createSession, destroySession } from '../../../lib/auth/session';

/** Stub sign-in: the form posts the chosen role. Replaced by real authentication in F-03. */
export async function signIn(formData: FormData): Promise<void> {
  const role = formData.get('role');
  const locale = formData.get('locale');
  if (!isRole(role) || !isLocale(locale)) return;
  await createSession(role);
  redirect({ href: `/${portalOfRole(role)}`, locale });
}

export async function signOut(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  await destroySession();
  redirect({ href: '/login', locale });
}
