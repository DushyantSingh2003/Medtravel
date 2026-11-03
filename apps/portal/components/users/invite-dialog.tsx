'use client';

import { useCreateInvitation } from '@medtravel/api-client';
import { STAFF_ROLES, type Role } from '@medtravel/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@medtravel/ui';
import { useTranslations } from 'next-intl';
import { useId, useState, type FormEvent } from 'react';
import { problemMap } from './problem-map';

/** Invites a staff member by email; they choose their password from the link. */
export function InviteDialog({
  open,
  onOpenChange,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: () => void;
}) {
  const t = useTranslations('users.invite');
  const closeLabel = useTranslations('users.actions')('close');
  const roles = useTranslations('roles');
  const id = useId();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('case_manager');
  const [problems, setProblems] = useState<Record<string, string>>({});
  const invite = useCreateInvitation();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setProblems({});
    invite.mutate(
      { data: { email: email.trim(), name: name.trim(), role } },
      {
        onSuccess: () => {
          toast.success(t('sent'));
          setEmail('');
          setName('');
          onOpenChange(false);
          onInvited();
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={closeLabel}>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-email`}>{t('email')}</Label>
            <Input
              id={`${id}-email`}
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(problems['email'])}
              required
            />
            {problems['email'] ? (
              <p className="text-sm text-destructive">{problems['email']}</p>
            ) : null}
          </div>
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
            <Label htmlFor={`${id}-role`}>{t('role')}</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
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
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={invite.isPending || !email || !name}>
              {t('send')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
