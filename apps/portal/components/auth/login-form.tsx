'use client';

import { useLogin } from '@medtravel/api-client';
import { loginSchema } from '@medtravel/contracts';
import { Button, FormInput } from '@medtravel/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useRouter } from '../../i18n/navigation';
import { AuthLink } from './auth-links';
import { CHALLENGE_STORAGE_KEY, destinationOf } from './destination';
import { useAuthMessage } from './use-auth-message';

type Values = z.input<typeof loginSchema>;

export function LoginForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const message = useAuthMessage();
  const login = useLogin();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const { data } = await login.mutateAsync({ data: values });
      if (data.status === 'two_factor_required' && data.challengeToken) {
        sessionStorage.setItem(CHALLENGE_STORAGE_KEY, data.challengeToken);
        router.push('/login/two-factor');
      } else if (data.user) {
        router.replace(destinationOf(data.user));
        router.refresh();
      }
    } catch (failure) {
      setError(message(failure, t('login.invalid')));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <FormInput
        control={form.control}
        name="email"
        label={t('common.email')}
        type="email"
        autoComplete="username"
        dir="ltr"
        required
        requiredLabel={t('common.required')}
      />
      <FormInput
        control={form.control}
        name="password"
        label={t('common.password')}
        type="password"
        autoComplete="current-password"
        required
        requiredLabel={t('common.required')}
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        {t('login.submit')}
      </Button>
      <p className="flex flex-wrap justify-between gap-2 text-sm">
        <AuthLink href="/forgot-password">{t('login.forgot')}</AuthLink>
        <AuthLink href="/login/code">{t('login.withCode')}</AuthLink>
      </p>
    </form>
  );
}
