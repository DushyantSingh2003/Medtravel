'use client';

import { Button } from '@medtravel/ui';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

/** The ten backup codes, shown once, with copy and download, and a tick the user must give before they can go on. */
export function BackupCodes({
  codes,
  title,
  description,
  footer,
  confirmLabel,
}: {
  codes: string[];
  title: string;
  description: string;
  footer: ReactNode;
  confirmLabel: string;
}) {
  const t = useTranslations('auth.twoFactorSetup');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const text = codes.join('\n');

  const download = () => {
    const url = URL.createObjectURL(new Blob([`${text}\n`], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'medtravel-backup-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section aria-labelledby="backup-codes-title" className="space-y-4">
      <h2 id="backup-codes-title" className="text-lg font-semibold">
        {title}
      </h2>
      <p className="text-sm text-muted-foreground">{description}</p>
      <ul
        dir="ltr"
        className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted p-3 font-mono text-sm"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => setCopied(true));
          }}
        >
          {copied ? t('copied') : t('copy')}
        </Button>
        <Button type="button" variant="outline" onClick={download}>
          {t('download')}
        </Button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={saved}
          onChange={(event) => setSaved(event.target.checked)}
          className="size-4"
        />
        {confirmLabel}
      </label>
      <div aria-disabled={!saved} className={saved ? undefined : 'pointer-events-none opacity-50'}>
        {footer}
      </div>
    </section>
  );
}
