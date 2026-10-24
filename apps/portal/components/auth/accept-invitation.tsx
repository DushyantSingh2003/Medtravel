'use client';

import { ApiError, useAcceptInvitation, usePreviewInvitation } from '@medtravel/api-client';
import { passwordSchema } from '@medtravel/contracts';
import { Button, FormInput, Skeleton } from '@medtravel/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthLink } from './auth-links';
import { useAuthMessage } from './use-auth-message';

const schema = z.object({ password: passwordSchema });
type Values = z.input<typeof schema>;

/** Accepting an invitation: shows who it is for, and takes the password to set. */
export function AcceptInvitation({ token }: { token: string | null }) {
  const t = useTranslations('auth');
  const roles = useTranslations('roles');
  const message = useAuthMessage();
  const preview = usePreviewInvitation(token ?? '', {
    query: { enabled: token !== null, retry: false },
  });
  const accept = useAcceptInvitation();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: '' } });

  if (
    !token ||
    (preview.isError && preview.error instanceof ApiError && preview.error.status !== 0)
  ) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t('invitation.invalid')}
      </p>
    );
  }
  if (preview.isPending)
    return <Skeleton role="status" aria-label={t('common.loading')} className="h-32 w-full" />;
  if (preview.isError)
    return (
      <p role="alert" className="text-sm text-destructive">
        {t('common.networkError')}
      </p>
    );
  const invitation = preview.data.data;
  if (done) {
    return (
      <>
        <p role="status" className="text-sm">
          {t('invitation.done', { email: invitation.email })}
        </p>
        <AuthLink href="/login">{t('login.submit')}</AuthLink>
      </>
    );
  }
  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await accept.mutateAsync({ data: { token, password: values.password } });
      setDone(true);
    } catch (failure) {
      setError(message(failure, t('invitation.invalid')));
    }
  });
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-sm">
        {t('invitation.intro', { name: invitation.name, role: roles(invitation.role) })}
      </p>
      <p className="text-sm text-muted-foreground">
        <bdi dir="ltr">{invitation.email}</bdi>
      </p>
      <FormInput
        control={form.control}
        name="password"
        label={t('invitation.password')}
        description={t('reset.hint')}
        type="password"
        autoComplete="new-password"
        required
        requiredLabel={t('common.required')}
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        {t('invitation.submit')}
      </Button>
    </form>
  );
}
