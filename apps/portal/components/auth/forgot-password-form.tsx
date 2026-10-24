'use client';

import { useForgotPassword } from '@medtravel/api-client';
import { forgotPasswordSchema } from '@medtravel/contracts';
import { Button, FormInput } from '@medtravel/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useAuthMessage } from './use-auth-message';

type Values = z.input<typeof forgotPasswordSchema>;

export function ForgotPasswordForm() {
  const t = useTranslations('auth');
  const message = useAuthMessage();
  const forgot = useForgotPassword();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await forgot.mutateAsync({ data: values });
      setSent(true);
    } catch (failure) {
      setError(message(failure, t('common.serverError')));
    }
  });

  if (sent) return <p role="status" className="text-sm">{t('forgot.sent')}</p>;
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <FormInput control={form.control} name="email" label={t('common.email')} type="email" autoComplete="username" dir="ltr" required requiredLabel={t('common.required')} />
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        {t('forgot.submit')}
      </Button>
    </form>
  );
}
