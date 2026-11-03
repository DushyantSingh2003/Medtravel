'use client';

import {
  getGetUserQueryKey,
  getListUsersQueryKey,
  useAddUserLeave,
  useDeactivateUser,
  useGetUser,
  useImpersonateUser,
  useListTeams,
  useListUserLogins,
  useReactivateUser,
  useRemoveUserLeave,
  useResetUserTwoFactor,
  useUpdateUser,
  type UserDetailDto,
} from '@medtravel/api-client';
import { STAFF_ROLES, WEEKDAYS, portalOfRole, type Locale, type Role } from '@medtravel/contracts';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  intlLocale,
  toast,
} from '@medtravel/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, KeyRound, UserCheck, UserX } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { Link } from '../../i18n/navigation';
import { useMasterOptions } from '../masters/use-master-options';
import { problemMap } from './problem-map';

const NONE = 'none';
type Day = (typeof WEEKDAYS)[number];
const STATUS_VARIANT = {
  active: 'success',
  invited: 'info',
  suspended: 'warning',
  deactivated: 'muted',
} as const;

/** One person: their settings, hours and leave, and sign-in history, and the actions that end, reset or borrow their access. */
export function UserDetail({ id }: { id: string }) {
  const t = useTranslations('users');
  const roles = useTranslations('roles');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const user = useGetUser(id);
  const [confirm, setConfirm] = useState<'deactivate' | 'reactivate' | 'reset' | 'view' | null>(
    null,
  );
  const deactivate = useDeactivateUser();
  const reactivate = useReactivateUser();
  const reset = useResetUserTwoFactor();
  const impersonate = useImpersonateUser();

  const refresh = async (updated?: UserDetailDto) => {
    if (updated)
      queryClient.setQueryData(getGetUserQueryKey(id), {
        data: updated,
        status: 200,
        headers: new Headers(),
      });
    await queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
  };

  if (user.isPending) return <Skeleton className="h-64 w-full" />;
  if (user.isError || !user.data)
    return <EmptyState title={t('detail.loadFailed')} description={t('detail.notFound')} />;
  const detail = user.data.data;
  const name = detail.name;
  const isStaff = (STAFF_ROLES as readonly string[]).includes(detail.role);
  const canView = detail.status === 'active' && detail.role !== 'super_admin';
  const portal = portalOfRole(detail.role as Role);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Link
            href="/admin/users"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            {t('detail.back')}
          </Link>
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            <bdi>{name}</bdi>
            <Badge variant={STATUS_VARIANT[detail.status as keyof typeof STATUS_VARIANT]}>
              {t(`status.${detail.status}`)}
            </Badge>
            {detail.onLeave ? <Badge variant="warning">{t('onLeave')}</Badge> : null}
          </h2>
          <p className="text-sm text-muted-foreground">
            <bdi>{detail.email}</bdi> · {roles(detail.role)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canView ? (
            <Button variant="outline" onClick={() => setConfirm('view')}>
              <Eye aria-hidden="true" />
              {t('actions.viewAs')}
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => setConfirm('reset')}>
            <KeyRound aria-hidden="true" />
            {t('actions.resetTwoFactor')}
          </Button>
          {detail.status === 'deactivated' || detail.status === 'suspended' ? (
            <Button onClick={() => setConfirm('reactivate')}>
              <UserCheck aria-hidden="true" />
              {t('actions.reactivate')}
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => setConfirm('deactivate')}>
              <UserX aria-hidden="true" />
              {t('actions.deactivate')}
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">{t('detail.tabs.profile')}</TabsTrigger>
          {isStaff ? <TabsTrigger value="schedule">{t('detail.tabs.schedule')}</TabsTrigger> : null}
          <TabsTrigger value="signIns">{t('detail.tabs.signIns')}</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-4">
          <ProfileForm
            key={`${detail.id}-${detail.role}`}
            detail={detail}
            isStaff={isStaff}
            onSaved={refresh}
          />
        </TabsContent>
        {isStaff ? (
          <TabsContent value="schedule" className="mt-4 space-y-8">
            <HoursForm detail={detail} onSaved={refresh} />
            <LeavePanel detail={detail} onChanged={refresh} />
          </TabsContent>
        ) : null}
        <TabsContent value="signIns" className="mt-4">
          <SignIns id={id} />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirm === 'deactivate'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('confirm.deactivateTitle', { name })}
        description={t('confirm.deactivateBody')}
        confirmLabel={t('actions.deactivate')}
        cancelLabel={t('actions.cancel')}
        closeLabel={t('actions.close')}
        errorLabel={t('actions.error')}
        destructive
        onConfirm={async () => {
          const res = await deactivate.mutateAsync({ id });
          toast.success(t('confirm.deactivateDone'));
          setConfirm(null);
          await refresh(res.data);
        }}
      />
      <ConfirmDialog
        open={confirm === 'reactivate'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('confirm.reactivateTitle', { name })}
        description={t('confirm.reactivateBody')}
        confirmLabel={t('actions.reactivate')}
        cancelLabel={t('actions.cancel')}
        closeLabel={t('actions.close')}
        errorLabel={t('actions.error')}
        onConfirm={async () => {
          const res = await reactivate.mutateAsync({ id });
          toast.success(t('confirm.reactivateDone'));
          setConfirm(null);
          await refresh(res.data);
        }}
      />
      <ConfirmDialog
        open={confirm === 'reset'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('confirm.resetTitle', { name })}
        description={t('confirm.resetBody')}
        confirmLabel={t('actions.resetTwoFactor')}
        cancelLabel={t('actions.cancel')}
        closeLabel={t('actions.close')}
        errorLabel={t('actions.error')}
        destructive
        onConfirm={async () => {
          const res = await reset.mutateAsync({ id });
          toast.success(t('confirm.resetDone'));
          setConfirm(null);
          await refresh(res.data);
        }}
      />
      <ConfirmDialog
        open={confirm === 'view'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('confirm.viewTitle', { name })}
        description={t('confirm.viewBody')}
        confirmLabel={t('confirm.viewConfirm')}
        cancelLabel={t('actions.cancel')}
        closeLabel={t('actions.close')}
        errorLabel={t('actions.error')}
        onConfirm={async () => {
          await impersonate.mutateAsync({ id });
          // A full navigation: everything on screen must be reloaded as the other person, not patched.
          window.location.assign(
            new URL(`/${locale}/${portal}`, window.location.origin).toString(),
          );
        }}
      />
    </div>
  );
}

// ---- profile --------------------------------------------------------------------------------------------------
function ProfileForm({
  detail,
  isStaff,
  onSaved,
}: {
  detail: UserDetailDto;
  isStaff: boolean;
  onSaved: (d: UserDetailDto) => Promise<void>;
}) {
  const t = useTranslations('users');
  const roles = useTranslations('roles');
  const id = useId();
  const update = useUpdateUser();
  const cities = useMasterOptions('cities', isStaff);
  const teams = useListTeams();
  const [name, setName] = useState(detail.name);
  const [role, setRole] = useState<string>(detail.role);
  const [title, setTitle] = useState(detail.title ?? '');
  const [languages, setLanguages] = useState(detail.languages.join(', '));
  const [cityId, setCityId] = useState(detail.cityId ?? NONE);
  const [teamId, setTeamId] = useState(detail.teamId ?? NONE);
  const [assignable, setAssignable] = useState(detail.assignable);
  const [maxOpen, setMaxOpen] = useState(detail.maxOpenCases?.toString() ?? '');
  const [problems, setProblems] = useState<Record<string, string>>({});

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setProblems({});
    const codes = languages
      .split(',')
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean);
    update.mutate(
      {
        id: detail.id,
        data: {
          name: name.trim(),
          ...(isStaff
            ? {
                role: role as (typeof STAFF_ROLES)[number],
                title: title.trim() || null,
                languages: codes,
                cityId: cityId === NONE ? null : cityId,
                teamId: teamId === NONE ? null : teamId,
                assignable,
                maxOpenCases: maxOpen ? Number(maxOpen) : null,
              }
            : {}),
        },
      },
      {
        onSuccess: async (res) => {
          toast.success(t('profile.saved'));
          await onSaved(res.data);
        },
        onError: (error) => {
          const found = problemMap(error);
          if (Object.keys(found).length > 0) setProblems(found);
          else toast.error(t('profile.failed'));
        },
      },
    );
  };

  const error = (field: string) =>
    problems[field] ? <p className="text-sm text-destructive">{problems[field]}</p> : null;
  return (
    <form onSubmit={submit} className="grid max-w-2xl gap-4 sm:grid-cols-2" noValidate>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`${id}-name`}>{t('profile.name')}</Label>
        <Input
          id={`${id}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={Boolean(problems['name'])}
        />
        {error('name')}
      </div>
      {isStaff ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-role`}>{t('profile.role')}</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id={`${id}-role`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAFF_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {roles(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {error('role')}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-title`}>{t('profile.title')}</Label>
            <Input id={`${id}-title`} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-city`}>{t('profile.city')}</Label>
            <Select value={cityId} onValueChange={setCityId}>
              <SelectTrigger id={`${id}-city`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('profile.noCity')}</SelectItem>
                {(cities.data ?? []).map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {error('cityId')}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-team`}>{t('profile.team')}</Label>
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger id={`${id}-team`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('profile.noTeam')}</SelectItem>
                {(teams.data?.data.items ?? []).map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {error('teamId')}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-languages`}>{t('profile.languages')}</Label>
            <Input
              id={`${id}-languages`}
              dir="ltr"
              value={languages}
              onChange={(e) => setLanguages(e.target.value)}
              aria-describedby={`${id}-lh`}
            />
            <p id={`${id}-lh`} className="text-xs text-muted-foreground">
              {t('profile.languagesHint')}
            </p>
            {error('languages')}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-max`}>{t('profile.maxOpenCases')}</Label>
            <Input
              id={`${id}-max`}
              type="number"
              min={1}
              max={500}
              value={maxOpen}
              onChange={(e) => setMaxOpen(e.target.value)}
            />
            {error('maxOpenCases')}
          </div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch id={`${id}-assignable`} checked={assignable} onCheckedChange={setAssignable} />
            <Label htmlFor={`${id}-assignable`}>{t('profile.assignable')}</Label>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground sm:col-span-2">
          {t('profile.staffOnly')} {t('profile.roleHint')}
        </p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={update.isPending}>
          {t('profile.save')}
        </Button>
      </div>
    </form>
  );
}

// ---- working hours --------------------------------------------------------------------------------------------
interface DayHours {
  on: boolean;
  from: string;
  to: string;
}
const DEFAULT_DAY: DayHours = { on: true, from: '09:00', to: '18:00' };

function HoursForm({
  detail,
  onSaved,
}: {
  detail: UserDetailDto;
  onSaved: (d: UserDetailDto) => Promise<void>;
}) {
  const t = useTranslations('users.hours');
  const id = useId();
  const update = useUpdateUser();
  const initial = (day: Day): DayHours => {
    const interval = detail.workingHours?.days?.[day]?.[0];
    return interval
      ? { on: true, from: interval.from, to: interval.to }
      : { ...DEFAULT_DAY, on: detail.workingHours ? false : !['sat', 'sun'].includes(day) };
  };
  const [days, setDays] = useState<Record<Day, DayHours>>(
    () => Object.fromEntries(WEEKDAYS.map((d) => [d, initial(d)])) as Record<Day, DayHours>,
  );
  const [timezone, setTimezone] = useState(
    detail.workingHours?.timezone ?? detail.timezone ?? 'Asia/Kolkata',
  );
  const [problem, setProblem] = useState('');
  const set = (day: Day, patch: Partial<DayHours>) =>
    setDays((current) => ({ ...current, [day]: { ...current[day], ...patch } }));

  const save = (clear: boolean) => {
    setProblem('');
    const workingHours = clear
      ? null
      : {
          timezone,
          days: Object.fromEntries(
            WEEKDAYS.filter((d) => days[d].on).map((d) => [
              d,
              [{ from: days[d].from, to: days[d].to }],
            ]),
          ),
        };
    update.mutate(
      { id: detail.id, data: { workingHours } },
      {
        onSuccess: async (res) => {
          toast.success(t('saved'));
          await onSaved(res.data);
        },
        onError: () => setProblem(t('invalid')),
      },
    );
  };

  return (
    <section aria-labelledby={`${id}-h`} className="max-w-2xl space-y-4">
      <h3 id={`${id}-h`} className="text-lg font-semibold">
        {t('title')}
      </h3>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-tz`}>{t('timezone')}</Label>
        <Input
          id={`${id}-tz`}
          dir="ltr"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="max-w-xs"
        />
      </div>
      <ul className="space-y-2">
        {WEEKDAYS.map((day) => (
          <li key={day} className="flex flex-wrap items-center gap-3">
            <span className="w-28 text-sm font-medium">{t(`days.${day}`)}</span>
            <Switch
              checked={days[day].on}
              onCheckedChange={(on) => set(day, { on })}
              aria-label={`${t(`days.${day}`)}: ${days[day].on ? t('from') : t('dayOff')}`}
            />
            {days[day].on ? (
              <>
                <Input
                  type="time"
                  aria-label={`${t(`days.${day}`)} ${t('from')}`}
                  value={days[day].from}
                  onChange={(e) => set(day, { from: e.target.value })}
                  className="w-32"
                  dir="ltr"
                />
                <Input
                  type="time"
                  aria-label={`${t(`days.${day}`)} ${t('to')}`}
                  value={days[day].to}
                  onChange={(e) => set(day, { to: e.target.value })}
                  className="w-32"
                  dir="ltr"
                />
              </>
            ) : (
              <span className="text-sm text-muted-foreground">{t('dayOff')}</span>
            )}
          </li>
        ))}
      </ul>
      {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => save(false)} disabled={update.isPending}>
          {t('save')}
        </Button>
        {detail.workingHours ? (
          <Button variant="ghost" onClick={() => save(true)} disabled={update.isPending}>
            {t('clear')}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

// ---- leave ----------------------------------------------------------------------------------------------------
function LeavePanel({
  detail,
  onChanged,
}: {
  detail: UserDetailDto;
  onChanged: (d: UserDetailDto) => Promise<void>;
}) {
  const t = useTranslations('users.leave');
  const locale = useLocale() as Locale;
  const id = useId();
  const add = useAddUserLeave();
  const remove = useRemoveUserLeave();
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [note, setNote] = useState('');
  const [problems, setProblems] = useState<Record<string, string>>({});
  const format = useMemo(
    () => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium', timeZone: 'UTC' }),
    [locale],
  );
  const show = (day: string) => format.format(new Date(`${day}T00:00:00Z`));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setProblems({});
    add.mutate(
      { id: detail.id, data: { startsOn, endsOn, ...(note.trim() ? { note: note.trim() } : {}) } },
      {
        onSuccess: async (res) => {
          toast.success(t('added'));
          setStartsOn('');
          setEndsOn('');
          setNote('');
          await onChanged(res.data);
        },
        onError: (error) => {
          const found = problemMap(error);
          if (Object.keys(found).length > 0) setProblems(found);
          else toast.error(t('failed'));
        },
      },
    );
  };

  return (
    <section aria-labelledby={`${id}-h`} className="max-w-2xl space-y-4">
      <h3 id={`${id}-h`} className="text-lg font-semibold">
        {t('title')}
      </h3>
      {detail.leaves.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('none')}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {detail.leaves.map((leave) => (
            <li
              key={leave.id}
              className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
            >
              <span>
                {t('range', { from: show(leave.startsOn), to: show(leave.endsOn) })}
                {leave.note ? (
                  <span className="text-muted-foreground">
                    {' '}
                    · <bdi>{leave.note}</bdi>
                  </span>
                ) : null}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(
                    { id: detail.id, leaveId: leave.id },
                    {
                      onSuccess: async (res) => {
                        toast.success(t('removed'));
                        await onChanged(res.data);
                      },
                    },
                  )
                }
              >
                {t('remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-start`}>{t('start')}</Label>
          <Input
            id={`${id}-start`}
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            aria-invalid={Boolean(problems['startsOn'])}
          />
          {problems['startsOn'] ? (
            <p className="text-sm text-destructive">{problems['startsOn']}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-end`}>{t('end')}</Label>
          <Input
            id={`${id}-end`}
            type="date"
            value={endsOn}
            min={startsOn || undefined}
            onChange={(e) => setEndsOn(e.target.value)}
            aria-invalid={Boolean(problems['endsOn'])}
          />
          {problems['endsOn'] ? (
            <p className="text-sm text-destructive">{problems['endsOn']}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-note`}>{t('note')}</Label>
          <Input
            id={`${id}-note`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
          />
        </div>
        <Button type="submit" disabled={add.isPending || !startsOn || !endsOn}>
          {t('add')}
        </Button>
      </form>
    </section>
  );
}

// ---- sign-in history ------------------------------------------------------------------------------------------
function SignIns({ id }: { id: string }) {
  const t = useTranslations('users.logins');
  const locale = useLocale() as Locale;
  const logins = useListUserLogins(id, { limit: 50 });
  const format = useMemo(
    () => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium', timeStyle: 'medium' }),
    [locale],
  );
  const label = (action: string) => {
    const key = `events.${action.replaceAll('.', '_')}`;
    return t.has(key as never) ? t(key as never) : action;
  };
  if (logins.isPending) return <Skeleton className="h-32 w-full" />;
  const items = logins.data?.data.items ?? [];
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{t('empty')}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{t('caption')}</caption>
        <thead>
          <tr className="border-b text-start">
            <th scope="col" className="p-2 text-start font-medium">
              {t('time')}
            </th>
            <th scope="col" className="p-2 text-start font-medium">
              {t('event')}
            </th>
            <th scope="col" className="p-2 text-start font-medium">
              {t('address')}
            </th>
            <th scope="col" className="p-2 text-start font-medium">
              {t('device')}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id} className="border-b">
              <td className="p-2">
                <time dateTime={row.at}>{format.format(new Date(row.at))}</time>
              </td>
              <td className="p-2">{label(row.action)}</td>
              <td className="p-2" dir="ltr">
                {row.ip ?? '—'}
              </td>
              <td className="max-w-xs truncate p-2" dir="ltr">
                {row.userAgent ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
