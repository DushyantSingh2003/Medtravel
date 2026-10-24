'use client';

import { useEnableTwoFactor, useLogout, useSetUpTwoFactor, type TwoFactorSetupDto } from '@medtravel/api-client';
import { twoFactorEnableSchema } from '@medtravel/contracts';
import { Button, FormInput, Skeleton } from '@medtravel/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useRouter } from '../../i18n/navigation';
import { BackupCodes } from './backup-codes';
import { useAuthMessage } from './use-auth-message';

type Values = z.input<typeof twoFactorEnableSchema>;

/**
 * Enrolment: a QR code and key for the authenticator app, then a code from the app to prove it works, then the one-time
 * display of the backup codes. Shown to users whose role requires it (before anything else works) and from account security.
 */
export function TwoFactorSetup({ destination }: { destination: string }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const message = useAuthMessage();
  const setUp = useSetUpTwoFactor();
  const enable = useEnableTwoFactor();
  const logout = useLogout();
  const [setup, setSetup] = useState<TwoFactorSetupDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const started = useRef(false);
  const form = useForm<Values>({ resolver: zodResolver(twoFactorEnableSchema), defaultValues: { code: '' } });

  // One secret per visit: the guard stops React's development double-run from asking for two.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    setUp.mutateAsync().then(({ data }) => setSetup(data), () => setFailed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const { data } = await enable.mutateAsync({ data: values });
      setBackupCodes(data.backupCodes);
    } catch (failure) {
      setError(message(failure, t('twoFactorSetup.invalid')));
    }
  });

  if (backupCodes) {
    return (
      <BackupCodes
        codes={backupCodes}
        title={t('twoFactorSetup.backupTitle')}
        description={t('twoFactorSetup.backupBody')}
        footer={
          <Button
            className="w-full"
            onClick={() => {
              router.replace(destination);
              router.refresh();
            }}
          >
            {t('twoFactorSetup.continue')}
          </Button>
        }
        confirmLabel={t('twoFactorSetup.saved')}
      />
    );
  }
  if (failed) return <p role="alert" className="text-sm text-destructive">{t('twoFactorSetup.failed')}</p>;
  if (!setup) {
    return (
      <div role="status" aria-label={t('twoFactorSetup.starting')} className="space-y-3">
        <Skeleton className="h-40 w-40" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('twoFactorSetup.scan')}</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL made by the API; there is nothing to optimise */}
      <img src={setup.qrCodeDataUrl} alt={t('twoFactorSetup.qrAlt')} width={192} height={192} className="mx-auto rounded-md border border-border bg-white p-2" />
      <p className="text-sm">
        {t('twoFactorSetup.manual')} <bdi dir="ltr" className="font-mono break-all select-all">{setup.secret}</bdi>
      </p>
      <FormInput control={form.control} name="code" label={t('twoFactorSetup.code')} autoComplete="one-time-code" dir="ltr" required requiredLabel={t('common.required')} />
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        {t('twoFactorSetup.enable')}
      </Button>
      <Button
        type="button"
        variant="link"
        className="h-auto p-0"
        onClick={() => logout.mutate(undefined, { onSettled: () => router.replace('/login') })}
      >
        {t('twoFactorSetup.signOut')}
      </Button>
    </form>
  );
}
