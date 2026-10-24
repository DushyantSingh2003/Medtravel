'use client';

import { useResetPassword } from '@medtravel/api-client';
import { passwordSchema } from '@medtravel/contracts';
import { Button, FormInput } from '@medtravel/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthLink } from './auth-links';
import { useAuthMessage } from './use-auth-message';

const schema = z.object({ password: passwordSchema });
type Values = z.input<typeof schema>;

/** Choosing a new password with the token from the emailed link. */
export function ResetPasswordForm({ token }: { token: string | null }) {
  const t = useTranslations('auth');
  const message = useAuthMessage();
  const reset = useResetPassword();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: '' } });

  if (!token) {
    return (
      <>
        <p role="alert" className="text-sm text-destructive">{t('reset.invalid')}</p>
        <AuthLink href="/forgot-password">{t('reset.ask')}</AuthLink>
      </>
    );
  }
  if (done) {
    return (
      <>
        <p role="status" className="text-sm">{t('reset.done')}</p>
        <AuthLink href="/login">{t('reset.signIn')}</AuthLink>
      </>
    );
  }
  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await reset.mutateAsync({ data: { token, password: values.password } });
      setDone(true);
    } catch (failure) {
      const invalid = failure instanceof Error && 'status' in failure && failure.status === 404;
      setError(invalid ? t('reset.invalid') : message(failure, t('reset.invalid')));
    }
  });
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <FormInput control={form.control} name="password" label={t('reset.password')} description={t('reset.hint')} type="password" autoComplete="new-password" required requiredLabel={t('common.required')} />
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        {t('reset.submit')}
      </Button>
    </form>
  );
}
