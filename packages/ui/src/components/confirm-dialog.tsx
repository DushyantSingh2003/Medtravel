'use client';

import { useEffect, useState } from 'react';
import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  closeLabel: string;
  /** Red confirm button for irreversible actions such as deleting or cancelling a case. */
  destructive?: boolean;
  /** May be async; the dialog shows a spinner and stays open until it settles. */
  onConfirm: () => void | Promise<void>;
  /** Shown inside the dialog when `onConfirm` throws or rejects. The dialog stays open so the user can retry. */
  errorLabel: string;
  /** Called with the failure, for logging or a toast. */
  onError?: (error: unknown) => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  closeLabel,
  destructive,
  onConfirm,
  errorLabel,
  onError,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  // A failure belongs to one attempt; reopening the dialog starts clean.
  useEffect(() => {
    if (!open) setFailed(false);
  }, [open]);

  async function confirm() {
    setPending(true);
    setFailed(false);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (error) {
      setFailed(true);
      onError?.(error);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogContent closeLabel={closeLabel}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {failed ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {errorLabel}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            onClick={confirm}
            loading={pending}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
