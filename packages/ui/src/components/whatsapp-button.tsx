import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export interface WhatsAppButtonProps extends Omit<ComponentProps<'a'>, 'children'> {
  /** A `https://wa.me/<number>` link. */
  href: string;
  /** What the button does, e.g. "Chat with us on WhatsApp". Also its accessible name. */
  label: string;
  /** Pin to the corner of the viewport (the website) instead of placing it in the flow. */
  floating?: boolean;
}

/** The green chat button. Opens in a new tab; floats at the reading-end bottom corner by default. */
export function WhatsAppButton({
  href,
  label,
  floating = true,
  className,
  ...props
}: WhatsAppButtonProps) {
  return (
    <a
      data-slot="whatsapp-button"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={cn(
        'inline-flex size-14 items-center justify-center rounded-full bg-success text-success-foreground shadow-lg transition-transform hover:scale-105',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        floating && 'fixed end-4 bottom-4 z-40 sm:end-6 sm:bottom-6',
        className,
      )}
      {...props}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="size-7 fill-current">
        <path d="M12.04 2a9.9 9.9 0 0 0-8.5 14.9L2 22l5.25-1.37A9.9 9.9 0 1 0 12.04 2Zm0 1.8a8.1 8.1 0 1 1-4.2 15.03l-.3-.18-3.1.8.83-3.03-.2-.31A8.1 8.1 0 0 1 12.04 3.8Zm-3.2 3.9c-.2 0-.5.07-.77.37-.26.3-1 1-1 2.4s1.03 2.8 1.17 3c.15.2 2 3.2 4.95 4.35 2.45.97 2.95.78 3.48.73.53-.05 1.7-.7 1.95-1.37.24-.68.24-1.26.17-1.38-.07-.12-.27-.2-.57-.35-.3-.15-1.7-.84-1.97-.94-.27-.1-.47-.15-.67.15-.2.3-.77.94-.94 1.13-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57Z" />
      </svg>
    </a>
  );
}
