'use client';

import {
  getListSessionsQueryKey,
  useChangePassword,
  useDisableTwoFactor,
  useListSessions,
  useLogoutOtherSessions,
  useRegenerateBackupCodes,
  useResendVerificationEmail,
  useRevokeSession,
} from '@medtravel/api-client';
import {
  changePasswordSchema,
  twoFactorDisableSchema,
  twoFactorEnableSchema,
  type AuthUser,
  type Locale,
} from '@medtravel/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormInput,
  Skeleton,
  intlLocale,
  toast,
} from '@medtravel/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Link, useRouter } from '../../i18n/navigation';
import { BackupCodes } from './backup-codes';
import { useAuthMessage } from './use-auth-message';

/** The signed-in user's own security settings: email, devices, two-step verification and password. */
export function SecurityPanel({ user }: { user: AuthUser }) {
  return (
    <div className="space-y-6">
      <EmailSection user={user} />
      <SessionsSection />
      <TwoFactorSection user={user} />
      <PasswordSection />
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function EmailSection({ user }: { user: AuthUser }) {
  const t = useTranslations('auth.security.email');
  const resend = useResendVerificationEmail();
  return (
    <Section title={t('title')}>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <bdi dir="ltr">{user.email}</bdi>
        <Badge variant={user.emailVerified ? 'success' : 'warning'}>
          {user.emailVerified ? t('verified') : t('unverified')}
        </Badge>
      </p>
      {!user.emailVerified ? (
        <Button
          variant="outline"
          loading={resend.isPending}
          onClick={() => resend.mutate(undefined, { onSuccess: () => toast.success(t('sent')) })}
        >
          {t('resend')}
        </Button>
      ) : null}
    </Section>
  );
}

function SessionsSection() {
  const t = useTranslations('auth.security.sessions');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const list = useListSessions();
  const revoke = useRevokeSession();
  const others = useLogoutOtherSessions();
  const formatDate = useMemo(
    () => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium', timeStyle: 'short' }),
    [locale],
  );
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
  const items = list.data?.data.items ?? [];

  return (
    <Section title={t('title')} description={t('description')}>
      {list.isPending ? (
        <Skeleton role="status" aria-label={t('title')} className="h-20 w-full" />
      ) : null}
      {list.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {t('error')}
        </p>
      ) : null}
      <ul className="divide-y divide-border">
        {items.map((session) => (
          <li key={session.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div className="space-y-0.5 text-sm">
              <p className="flex items-center gap-2 font-medium">
                {session.deviceLabel ?? t('unknown')}
                {session.current ? <Badge variant="info">{t('current')}</Badge> : null}
              </p>
              <p className="text-muted-foreground">
                {session.ip ? <bdi dir="ltr">{session.ip}</bdi> : null}
                {session.lastUsedAt
                  ? ` · ${t('lastActive', { time: formatDate.format(new Date(session.lastUsedAt)) })}`
                  : ''}
              </p>
            </div>
            {!session.current ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  revoke.mutate(
                    { id: session.id },
                    {
                      onSuccess: () => {
                        toast.success(t('signedOut'));
                        void refresh();
                      },
                    },
                  )
                }
              >
                {t('signOut')}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {items.length > 1 ? (
        <Button
          variant="outline"
          loading={others.isPending}
          onClick={() =>
            others.mutate(undefined, {
              onSuccess: () => {
                toast.success(t('signedOut'));
                void refresh();
              },
            })
          }
        >
          {t('signOutOthers')}
        </Button>
      ) : null}
    </Section>
  );
}

function TwoFactorSection({ user }: { user: AuthUser }) {
  const t = useTranslations('auth.security.twoFactor');
  const common = useTranslations('auth.common');
  const router = useRouter();
  const message = useAuthMessage();
  const regenerate = useRegenerateBackupCodes();
  const disable = useDisableTwoFactor();
  const [mode, setMode] = useState<'none' | 'regenerate' | 'disable'>('none');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const regenerateForm = useForm<z.input<typeof twoFactorEnableSchema>>({
    resolver: zodResolver(twoFactorEnableSchema),
    defaultValues: { code: '' },
  });
  const disableForm = useForm<z.input<typeof twoFactorDisableSchema>>({
    resolver: zodResolver(twoFactorDisableSchema),
    defaultValues: { password: '', code: '' },
  });

  const submitRegenerate = regenerateForm.handleSubmit(async (values) => {
    setError(null);
    try {
      const { data } = await regenerate.mutateAsync({ data: values });
      setCodes(data.backupCodes);
      setMode('none');
    } catch (failure) {
      setError(message(failure, t('invalid')));
    }
  });
  const submitDisable = disableForm.handleSubmit(async (values) => {
    setError(null);
    try {
      await disable.mutateAsync({ data: values });
      toast.success(t('turnedOff'));
      setMode('none');
      router.refresh();
    } catch (failure) {
      setError(message(failure, t('invalid')));
    }
  });

  return (
    <Section
      title={t('title')}
      description={user.twoFactorRequired ? t('required') : t('optional')}
    >
      <p className="flex items-center gap-2 text-sm">
        <Badge variant={user.twoFactorEnabled ? 'success' : 'muted'}>
          {user.twoFactorEnabled ? t('on') : t('off')}
        </Badge>
      </p>
      {!user.twoFactorEnabled ? (
        <Button asChild variant="outline">
          <Link href="/two-factor/setup">{t('setUp')}</Link>
        </Button>
      ) : null}
      {user.twoFactorEnabled && mode === 'none' && !codes ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setMode('regenerate')}>
            {t('regenerate')}
          </Button>
          {!user.twoFactorRequired ? (
            <Button variant="outline" onClick={() => setMode('disable')}>
              {t('disable')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {mode === 'regenerate' ? (
        <form onSubmit={submitRegenerate} noValidate className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('regenerateHint')}</p>
          <FormInput
            control={regenerateForm.control}
            name="code"
            label={t('code')}
            autoComplete="one-time-code"
            dir="ltr"
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" loading={regenerateForm.formState.isSubmitting}>
            {t('confirm')}
          </Button>
        </form>
      ) : null}
      {mode === 'disable' ? (
        <form onSubmit={submitDisable} noValidate className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('disableHint')}</p>
          <FormInput
            control={disableForm.control}
            name="password"
            label={common('password')}
            type="password"
            autoComplete="current-password"
          />
          <FormInput
            control={disableForm.control}
            name="code"
            label={t('code')}
            autoComplete="one-time-code"
            dir="ltr"
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="destructive" loading={disableForm.formState.isSubmitting}>
            {t('disable')}
          </Button>
        </form>
      ) : null}
      {codes ? (
        <BackupCodes
          codes={codes}
          title={t('newCodes')}
          description={t('regenerateHint')}
          confirmLabel={t('confirm')}
          footer={
            <Button variant="outline" onClick={() => setCodes(null)}>
              {t('confirm')}
            </Button>
          }
        />
      ) : null}
    </Section>
  );
}

function PasswordSection() {
  const t = useTranslations('auth.security.password');
  const message = useAuthMessage();
  const change = useChangePassword();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });
  const queryClient = useQueryClient();

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await change.mutateAsync({ data: values });
      form.reset();
      toast.success(t('changed'));
      void queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
    } catch (failure) {
      setError(message(failure, t('invalid')));
    }
  });
  return (
    <Section title={t('title')}>
      <form onSubmit={submit} noValidate className="space-y-3">
        <FormInput
          control={form.control}
          name="currentPassword"
          label={t('current')}
          type="password"
          autoComplete="current-password"
        />
        <FormInput
          control={form.control}
          name="newPassword"
          label={t('new')}
          type="password"
          autoComplete="new-password"
        />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" loading={form.formState.isSubmitting}>
          {t('change')}
        </Button>
      </form>
    </Section>
  );
}
