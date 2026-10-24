'use client';

import { useRegister } from '@medtravel/api-client';
import { registerSchema } from '@medtravel/contracts';
import { Button, FormInput } from '@medtravel/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { AuthLink } from './auth-links';
import { useAuthMessage } from './use-auth-message';

type Values = z.input<typeof registerSchema>;

/** Patient sign-up. Everyone else is invited. */
export function RegisterForm() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const message = useAuthMessage();
  const register = useRegister();
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(registerSchema), defaultValues: { name: '', email: '', password: '', language: locale === 'ar' ? 'ar' : 'en' } });

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await register.mutateAsync({ data: values });
      setEmail(values.email.trim().toLowerCase());
    } catch (failure) {
      setError(message(failure, t('common.serverError')));
    }
  });

  if (email) {
    return (
      <>
        <p role="status" className="text-sm">{t('register.sent', { email })}</p>
        <AuthLink href="/login">{t('login.submit')}</AuthLink>
      </>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <FormInput control={form.control} name="name" label={t('common.name')} autoComplete="name" required requiredLabel={t('common.required')} />
      <FormInput control={form.control} name="email" label={t('common.email')} type="email" autoComplete="username" dir="ltr" required requiredLabel={t('common.required')} />
      <FormInput control={form.control} name="password" label={t('common.password')} description={t('reset.hint')} type="password" autoComplete="new-password" required requiredLabel={t('common.required')} />
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        {t('register.submit')}
      </Button>
    </form>
  );
}
