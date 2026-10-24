import { BrandMark, Card, CardContent, CardDescription, CardHeader } from '@medtravel/ui';
import type { ReactNode } from 'react';

/** The frame of every sign-in page: the brand, a card with a title, the form, and the links under it. */
export function AuthCard({
  appName,
  title,
  description,
  children,
  footer,
}: {
  appName: string;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="flex items-center gap-3">
        <BrandMark className="size-10" />
        <p className="text-lg font-semibold">{appName}</p>
      </div>
      <Card>
        <CardHeader>
          <h1 className="text-xl leading-tight font-semibold">{title}</h1>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
      {footer ? <div className="space-y-2 text-center text-sm">{footer}</div> : null}
    </main>
  );
}
