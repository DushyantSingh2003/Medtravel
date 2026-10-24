'use client';

import { useRedeemMagicLink, useVerifyEmail } from '@medtravel/api-client';
import { Button, Skeleton } from '@medtravel/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from '../../i18n/navigation';
import { destinationOf } from './destination';

/** Confirms an email address with the token in the link, once, as soon as the page opens. */
export function VerifyEmail({ token }: { token: string | null }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const verify = useVerifyEmail();
  const started = useRef(false);
  const [state, setState] = useState<'working' | 'done' | 'invalid'>(token ? 'working' : 'invalid');

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    verify.mutateAsync({ data: { token } }).then(
      () => setState('done'),
      () => setState('invalid'),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (state === 'working') return <Skeleton role="status" aria-label={t('verifyEmail.working')} className="h-12 w-full" />;
  if (state === 'invalid') return <p role="alert" className="text-sm text-destructive">{t('verifyEmail.invalid')}</p>;
  return (
    <>
      <p role="status" className="text-sm">{t('verifyEmail.done')}</p>
      <Button className="w-full" onClick={() => router.replace('/')}>
        {t('verifyEmail.continue')}
      </Button>
    </>
  );
}

/** Opens a doctor's one-case session with the token in a magic link, once, as soon as the page opens. */
export function MagicLink({ token }: { token: string | null }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const redeem = useRedeemMagicLink();
  const started = useRef(false);
  const [invalid, setInvalid] = useState(!token);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    redeem.mutateAsync({ data: { token } }).then(
      ({ data }) => {
        if (data.user) {
          router.replace(destinationOf(data.user));
          router.refresh();
        }
      },
      () => setInvalid(true),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (invalid) return <p role="alert" className="text-sm text-destructive">{t('magic.invalid')}</p>;
  return <Skeleton role="status" aria-label={t('magic.working')} className="h-12 w-full" />;
}
