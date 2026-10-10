import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export const fieldClasses = [
  'w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm',
  'placeholder:text-muted-foreground transition-colors',
  'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'aria-invalid:border-destructive aria-invalid:focus-visible:outline-destructive',
];

export function Input({ className, type = 'text', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input data-slot="input" type={type} className={cn(fieldClasses, 'h-10', className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldClasses, 'min-h-20 py-2', className)}
      {...props}
    />
  );
}
