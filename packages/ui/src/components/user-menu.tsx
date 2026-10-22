'use client';

import type { ElementType, ReactNode } from 'react';
import { Avatar, AvatarFallback, AvatarImage, initialsOf } from './avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';

export interface UserMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  /** A link (use the router's Link through `linkComponent`) ... */
  href?: string;
  /** ... or an action, such as signing out. */
  onSelect?: () => void;
  destructive?: boolean;
}

export interface UserMenuProps {
  name: string;
  /** Second line under the name: the role, the email. */
  description?: string;
  avatarUrl?: string;
  items: UserMenuItem[];
  /** Name of the button, e.g. "Account menu". The user's name is added. */
  label: string;
  /** Heading above the name inside the menu, e.g. "Signed in as". */
  heading?: string;
  linkComponent?: ElementType;
}

export function UserMenu({
  name,
  description,
  avatarUrl,
  items,
  label,
  heading,
  linkComponent: LinkComponent = 'a',
}: UserMenuProps) {
  return (
    // Non-modal: a small account menu does not need the rest of the page hidden from assistive technology.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        data-slot="user-menu"
        className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="sr-only">
          {label}: <bdi>{name}</bdi>
        </span>
        <Avatar className="size-9">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
          <AvatarFallback aria-hidden="true">{initialsOf(name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {heading ? <DropdownMenuLabel>{heading}</DropdownMenuLabel> : null}
        <div className="px-2 pb-2">
          <p className="truncate text-sm font-medium">
            <bdi>{name}</bdi>
          </p>
          {description ? (
            <p className="truncate text-xs text-muted-foreground">
              <bdi>{description}</bdi>
            </p>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        {items.map((item) =>
          item.href ? (
            <DropdownMenuItem key={item.id} asChild destructive={item.destructive}>
              <LinkComponent href={item.href}>
                {item.icon}
                {item.label}
              </LinkComponent>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem key={item.id} onSelect={item.onSelect} destructive={item.destructive}>
              {item.icon}
              {item.label}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
