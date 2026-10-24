import { portalOfRole, type AuthUser } from '@medtravel/contracts';

/** Where a user goes right after signing in: the two-factor set-up while their session is limited, otherwise their portal. */
export const destinationOf = (user: AuthUser): string =>
  user.access === 'two_factor_setup' ? '/two-factor/setup' : `/${portalOfRole(user.role)}`;

/** The key the second sign-in step reads the challenge token from; it lives only as long as the tab. */
export const CHALLENGE_STORAGE_KEY = 'mt:two-factor-challenge';
