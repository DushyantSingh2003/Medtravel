'use client';

import {
  getListTeamsQueryKey,
  useCreateTeam,
  useDeleteTeam,
  useListTeams,
  useListUsers,
  useUpdateTeam,
  type TeamDto,
} from '@medtravel/api-client';
import { STAFF_ROLES } from '@medtravel/contracts';
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
} from '@medtravel/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, type FormEvent } from 'react';
import { problemMap } from './problem-map';

const NONE = 'none';

/** The teams, their managers and member counts, with add, edit and delete. */
export function TeamsPanel() {
  const t = useTranslations('users.teams');
  const actions = useTranslations('users.actions');
  const queryClient = useQueryClient();
  const teams = useListTeams();
  const remove = useDeleteTeam();
  const [editing, setEditing] = useState<TeamDto | 'new' | null>(null);
  const [deleting, setDeleting] = useState<TeamDto | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListTeamsQueryKey() });
  const items = teams.data?.data.items ?? [];

  return (
    <section aria-labelledby="teams-heading" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="teams-heading" className="text-lg font-semibold">
          {t('title')}
        </h2>
        <Button onClick={() => setEditing('new')}>
          <Plus aria-hidden="true" />
          {t('add')}
        </Button>
      </div>
      {teams.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : teams.isError ? (
        <EmptyState title={t('failed')} icon={<Users aria-hidden="true" />} />
      ) : items.length === 0 ? (
        <EmptyState title={t('empty')} icon={<Users aria-hidden="true" />} />
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((team) => (
            <li key={team.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="font-medium">
                  <bdi>{team.name}</bdi>
                </p>
                <p className="text-sm text-muted-foreground">
                  <bdi>{team.managerName ?? t('noManager')}</bdi> ·{' '}
                  {t('members', { count: team.memberCount })}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(team)}>
                  {t('edit')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleting(team)}>
                  {t('delete')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <TeamDialog
          team={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => void refresh()}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('deleteTitle', { name: deleting?.name ?? '' })}
        description={t('deleteBody')}
        confirmLabel={t('delete')}
        cancelLabel={actions('cancel')}
        closeLabel={actions('close')}
        errorLabel={actions('error')}
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          await remove.mutateAsync({ id: deleting.id });
          toast.success(t('deleted'));
          setDeleting(null);
          await refresh();
        }}
      />
    </section>
  );
}

function TeamDialog({
  team,
  onClose,
  onSaved,
}: {
  team: TeamDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('users.teams');
  const actions = useTranslations('users.actions');
  const roles = useTranslations('roles');
  const id = useId();
  const [name, setName] = useState(team?.name ?? '');
  const [managerId, setManagerId] = useState(team?.managerId ?? NONE);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const create = useCreateTeam();
  const update = useUpdateTeam();
  const staff = useListUsers({ limit: 100, status: 'active' });
  const candidates = (staff.data?.data.items ?? []).filter((u) =>
    (STAFF_ROLES as readonly string[]).includes(u.role),
  );
  const pending = create.isPending || update.isPending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setProblems({});
    const data = { name: name.trim(), managerId: managerId === NONE ? null : managerId };
    const options = {
      onSuccess: () => {
        toast.success(t('saved'));
        onSaved();
        onClose();
      },
      onError: (error: unknown) => {
        const found = problemMap(error);
        if (Object.keys(found).length > 0) setProblems(found);
        else toast.error(t('failed'));
      },
    };
    if (team) update.mutate({ id: team.id, data }, options);
    else create.mutate({ data }, options);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={actions('close')}>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{team ? t('editTitle') : t('addTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-name`}>{t('name')}</Label>
            <Input
              id={`${id}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={Boolean(problems['name'])}
              required
            />
            {problems['name'] ? (
              <p className="text-sm text-destructive">{problems['name']}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-manager`}>{t('manager')}</Label>
            <Select value={managerId} onValueChange={setManagerId}>
              <SelectTrigger id={`${id}-manager`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('noManager')}</SelectItem>
                {candidates.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} ({roles(u.role)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {problems['managerId'] ? (
              <p className="text-sm text-destructive">{problems['managerId']}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {actions('cancel')}
            </Button>
            <Button type="submit" disabled={pending || name.trim().length < 2}>
              {t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
