'use client';

import { useRequestLoginCode, useVerifyLoginCode } from '@medtravel/api-client';
import { otpRequestSchema, otpVerifySchema } from '@medtravel/contracts';
import { Button, FormInput } from '@medtravel/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useRouter } from '../../i18n/navigation';
import { CHALLENGE_STORAGE_KEY, destinationOf } from './destination';
import { useAuthMessage } from './use-auth-message';

type RequestValues = z.input<typeof otpRequestSchema>;
type VerifyValues = z.input<typeof otpVerifySchema>;

/** Two steps on one page: ask for a code for an email address or phone number, then type it. */
export function LoginCodeForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const message = useAuthMessage();
  const request = useRequestLoginCode();
  const verify = useVerifyLoginCode();
  const [identifier, setIdentifier] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = useForm<RequestValues>({ resolver: zodResolver(otpRequestSchema), defaultValues: { identifier: '' } });
  const answer = useForm<VerifyValues>({ resolver: zodResolver(otpVerifySchema), defaultValues: { identifier: '', code: '' } });

  const send = async (value: string) => {
    setError(null);
    try {
      await request.mutateAsync({ data: { identifier: value } });
      setIdentifier(value);
      answer.reset({ identifier: value, code: '' });
    } catch (failure) {
      setError(message(failure, t('loginCode.invalid')));
    }
  };

  const submitAsk = ask.handleSubmit((values) => send(values.identifier.trim()));
  const submitAnswer = answer.handleSubmit(async (values) => {
    setError(null);
    try {
      const { data } = await verify.mutateAsync({ data: values });
      if (data.status === 'two_factor_required' && data.challengeToken) {
        sessionStorage.setItem(CHALLENGE_STORAGE_KEY, data.challengeToken);
        router.push('/login/two-factor');
      } else if (data.user) {
        router.replace(destinationOf(data.user));
        router.refresh();
      }
    } catch (failure) {
      setError(message(failure, t('loginCode.invalid')));
    }
  });

  if (identifier === null) {
    return (
      <form onSubmit={submitAsk} noValidate className="space-y-4">
        <FormInput control={ask.control} name="identifier" label={t('loginCode.identifier')} description={t('loginCode.identifierHint')} autoComplete="username" dir="ltr" required requiredLabel={t('common.required')} />
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" loading={ask.formState.isSubmitting}>
          {t('loginCode.send')}
        </Button>
        <p className="text-sm text-muted-foreground">{t('loginCode.staffNote')}</p>
      </form>
    );
  }
  return (
    <form onSubmit={submitAnswer} noValidate className="space-y-4">
      <p role="status" className="text-sm">
        {t('loginCode.sent', { identifier })}
      </p>
      <FormInput control={answer.control} name="code" label={t('common.code')} autoComplete="one-time-code" dir="ltr" required requiredLabel={t('common.required')} />
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" loading={answer.formState.isSubmitting}>
        {t('loginCode.verify')}
      </Button>
      <p className="flex flex-wrap justify-between gap-2 text-sm">
        <Button type="button" variant="link" className="h-auto p-0" onClick={() => void send(identifier)}>
          {t('loginCode.resend')}
        </Button>
        <Button type="button" variant="link" className="h-auto p-0" onClick={() => setIdentifier(null)}>
          {t('loginCode.different')}
        </Button>
      </p>
    </form>
  );
}
