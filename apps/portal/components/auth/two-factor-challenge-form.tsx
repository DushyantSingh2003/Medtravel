'use client';

import { useAnswerTwoFactorChallenge } from '@medtravel/api-client';
import { backupCodeSchema, sixDigitCodeSchema } from '@medtravel/contracts';
import { Button, FormInput } from '@medtravel/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useRouter } from '../../i18n/navigation';
import { AuthLink } from './auth-links';
import { CHALLENGE_STORAGE_KEY, destinationOf } from './destination';
import { useAuthMessage } from './use-auth-message';

const appSchema = z.object({ code: sixDigitCodeSchema });
const backupSchema = z.object({ code: backupCodeSchema });
type Values = z.input<typeof appSchema>;

/** The second sign-in step for a user who has two-step verification: a code from the app, or a backup code. */
export function TwoFactorChallengeForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const message = useAuthMessage();
  const challenge = useAnswerTwoFactorChallenge();
  const [backup, setBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // undefined while rendering on the server (no storage there), then the token, or null when there is none.
  const token = useSyncExternalStore(
    () => () => undefined,
    () => sessionStorage.getItem(CHALLENGE_STORAGE_KEY),
    () => undefined,
  );
  const form = useForm<Values>({
    resolver: zodResolver(backup ? backupSchema : appSchema),
    defaultValues: { code: '' },
  });

  const submit = form.handleSubmit(async (values) => {
    if (!token) return;
    setError(null);
    try {
      const { data } = await challenge.mutateAsync({
        data: { challengeToken: token, code: values.code.trim() },
      });
      sessionStorage.removeItem(CHALLENGE_STORAGE_KEY);
      if (data.user) {
        router.replace(destinationOf(data.user));
        router.refresh();
      }
    } catch (failure) {
      setError(message(failure, t('twoFactor.invalid')));
    }
  });

  if (token === null) {
    return (
      <>
        <p role="alert" className="text-sm text-destructive">
          {t('twoFactor.expired')}
        </p>
        <AuthLink href="/login">{t('twoFactor.backToLogin')}</AuthLink>
      </>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {backup ? t('twoFactor.backupDescription') : t('twoFactor.description')}
      </p>
      <FormInput
        control={form.control}
        name="code"
        label={backup ? t('twoFactor.backupCode') : t('twoFactor.code')}
        autoComplete="one-time-code"
        dir="ltr"
        required
        requiredLabel={t('common.required')}
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        className="w-full"
        loading={form.formState.isSubmitting}
        disabled={token === undefined}
      >
        {t('twoFactor.verify')}
      </Button>
      <Button
        type="button"
        variant="link"
        className="h-auto p-0"
        onClick={() => {
          setBackup((value) => !value);
          form.reset({ code: '' });
          setError(null);
        }}
      >
        {backup ? t('twoFactor.useApp') : t('twoFactor.useBackup')}
      </Button>
    </form>
  );
}
