'use client';

import { Globe } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './dropdown-menu';

export interface SwitcherOption {
  value: string;
  /** Shown in the menu, in the option's own language where it has one (English, العربية). */
  label: string;
  /** Shown on the button instead of `label`, for example "USD" for "US dollar". */
  short?: string;
}

export interface SwitcherProps {
  /** What is being switched, e.g. "Language". Names the button and heads the menu. */
  label: string;
  value: string;
  options: SwitcherOption[];
  onValueChange: (value: string) => void;
  icon?: ReactNode;
  /** Hide the current value on narrow screens, leaving the icon. Default true. */
  collapseOnSmall?: boolean;
  disabled?: boolean;
}

/** A compact menu for choosing one value: the language, the currency. */
export function Switcher({
  label,
  value,
  options,
  onValueChange,
  icon,
  collapseOnSmall = true,
  disabled,
}: SwitcherProps) {
  const current = options.find((option) => option.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          data-slot="switcher"
          className="gap-1.5"
        >
          {icon ?? <Globe aria-hidden="true" />}
          <span className="sr-only">{label}: </span>
          <span className={collapseOnSmall ? 'hidden sm:inline' : undefined}>
            <bdi>{current?.short ?? current?.label ?? value}</bdi>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <bdi>{option.label}</bdi>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
