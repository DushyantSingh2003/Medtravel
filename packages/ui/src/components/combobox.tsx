'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
import { Command } from 'cmdk';
import { useState } from 'react';
import { cn } from '../lib/cn';
import { fieldClasses } from './input';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Extra text matched by the search box (for example an alternative spelling or a code). */
  keywords?: string[];
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  id?: string;
  disabled?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  'aria-label'?: string;
  className?: string;
}

/** Searchable single select. Type to filter, arrow keys to move, Enter to choose, Escape to close. */
export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  className,
  ...rest
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          data-slot="combobox"
          className={cn(fieldClasses, 'flex h-10 items-center justify-between gap-2 text-start', !selected && 'text-muted-foreground', className)}
          {...rest}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
        <Command>
          <Command.Input
            placeholder={searchPlaceholder}
            className="h-10 w-full border-b bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Command.List className="max-h-60 overflow-y-auto p-1">
            <Command.Empty className="px-3 py-4 text-center text-sm text-muted-foreground">{emptyLabel}</Command.Empty>
            {options.map((option) => (
              <Command.Item
                key={option.value}
                value={option.label}
                keywords={option.keywords}
                onSelect={() => {
                  onChange(option.value === value ? null : option.value);
                  setOpen(false);
                }}
                className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm select-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
              >
                <Check className={cn('size-4 shrink-0', option.value === value ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                <span className="truncate">{option.label}</span>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
