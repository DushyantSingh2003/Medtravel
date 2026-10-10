'use client';

import type { Locale } from '@medtravel/contracts';
import { Paperclip, Send, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { cn } from '../lib/cn';
import { MAX_UPLOAD_BYTES, formatBytes, rejectionFor, type FileRejection } from '../lib/files';
import { Avatar, AvatarFallback, AvatarImage, initialsOf } from './avatar';
import { Button } from './button';
import { Textarea } from './input';

export interface ChatAttachment {
  id: string;
  name: string;
  size: number;
  href?: string;
}

export interface ChatMessage {
  id: string;
  author: { name: string; avatarUrl?: string };
  /** True for the signed-in user's own messages; they align to the end. */
  own: boolean;
  body: string;
  /** ISO timestamp for the `datetime` attribute. */
  dateTime: string;
  /** Formatted for the viewer's locale and time zone by the caller. */
  timeLabel: string;
  attachments?: ChatAttachment[];
}

export interface ChatPanelLabels {
  /** Name of the message log. */
  log: string;
  placeholder: string;
  send: string;
  attach: string;
  removeAttachment: string;
  empty: string;
  /** Shown when `onSend` rejects; the text and files stay in the composer so nothing is lost. */
  sendFailed: string;
  /** Why an attachment was not added, e.g. "report.pdf is larger than 500 MB". */
  rejected: Record<FileRejection, (fileName: string) => string>;
}

export interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (message: { text: string; files: File[] }) => void | Promise<void>;
  labels: ChatPanelLabels;
  locale?: Locale;
  maxFileSize?: number;
  /** MIME types, wildcards or extensions, like the FileUploader. Empty allows all. Re-check on the server. */
  allowedFileTypes?: string[];
  maxAttachments?: number;
  /** Disable the composer, e.g. while the connection is down. */
  disabled?: boolean;
  /** Height of the whole panel; the message list scrolls inside it. */
  className?: string;
}

/** Only web links and relative paths are rendered as links; anything else (javascript:, data:) is shown as text. */
function safeHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href, 'https://placeholder.invalid');
    return url.protocol === 'https:' || url.protocol === 'http:' ? href : undefined;
  } catch {
    return undefined;
  }
}

/** Message list plus composer. Enter sends, Shift+Enter adds a line, new messages are announced politely. */
export function ChatPanel({
  messages,
  onSend,
  labels,
  locale = 'en',
  maxFileSize = MAX_UPLOAD_BYTES,
  allowedFileTypes = [],
  maxAttachments = 10,
  disabled,
  className,
}: ChatPanelProps) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const stickToEnd = useRef(true);
  // A ref, not state: two quick Enter presses must not both pass the guard before a re-render.
  const inFlight = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Scroll the log itself (never the page) and only when the reader is already at the end,
  // so reading older messages is not interrupted. The first paint and own messages always go to the end.
  const lastOwn = messages.at(-1)?.own ?? false;
  useEffect(() => {
    const log = logRef.current;
    if (log && (stickToEnd.current || lastOwn)) log.scrollTop = log.scrollHeight;
  }, [messages.length, lastOwn]);

  function addAttachments(incoming: File[]) {
    const rejected: string[] = [];
    const accepted: File[] = [];
    for (const file of incoming) {
      const existing = [...files, ...accepted].map((f) => ({ name: f.name, size: f.size }));
      const reason = rejectionFor(
        file,
        { maxFileSize, allowedFileTypes, maxNumberOfFiles: maxAttachments },
        existing,
      );
      if (reason) rejected.push(labels.rejected[reason](file.name));
      else accepted.push(file);
    }
    setProblems(rejected);
    if (accepted.length > 0) setFiles((current) => [...current, ...accepted]);
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = text.trim();
    if ((!trimmed && files.length === 0) || inFlight.current || disabled) return;
    inFlight.current = true;
    setSending(true);
    setProblems([]);
    try {
      await onSend({ text: trimmed, files });
      setText('');
      setFiles([]);
    } catch {
      setProblems([labels.sendFailed]);
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Do not send while an input method (Arabic, Chinese, Japanese) is still composing text.
    // keyCode 229 covers Safari, which reports the Enter that ends composition after isComposing is false.
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      event.nativeEvent.keyCode !== 229
    ) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <div
      data-slot="chat-panel"
      className={cn('flex h-[28rem] flex-col overflow-hidden rounded-xl border bg-card', className)}
    >
      <div
        ref={logRef}
        role="log"
        aria-label={labels.log}
        onScroll={(event) => {
          const log = event.currentTarget;
          stickToEnd.current = log.scrollHeight - log.scrollTop - log.clientHeight < 48;
        }}
        aria-live="polite"
        className="flex-1 space-y-4 overflow-y-auto p-3 sm:p-4"
      >
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{labels.empty}</p>
        ) : null}
        {messages.map((message) => (
          <div
            key={message.id}
            data-own={message.own}
            className={cn('flex items-end gap-2', message.own && 'flex-row-reverse')}
          >
            <Avatar className="size-8">
              {message.author.avatarUrl ? (
                <AvatarImage src={message.author.avatarUrl} alt="" />
              ) : null}
              <AvatarFallback className="text-xs">{initialsOf(message.author.name)}</AvatarFallback>
            </Avatar>
            <div className={cn('flex max-w-[80%] flex-col gap-1', message.own && 'items-end')}>
              <div
                className={cn(
                  'rounded-2xl px-3 py-2 text-sm',
                  message.own
                    ? 'rounded-ee-sm bg-primary text-primary-foreground'
                    : 'rounded-es-sm bg-muted',
                )}
              >
                <p className="whitespace-pre-wrap break-words" dir="auto">
                  {message.body}
                </p>
                {message.attachments?.length ? (
                  <ul className="mt-2 space-y-1">
                    {message.attachments.map((file) => (
                      <li key={file.id}>
                        {safeHref(file.href) ? (
                          <a
                            href={safeHref(file.href)}
                            className="inline-flex max-w-full items-center gap-1.5 underline underline-offset-2"
                          >
                            <Paperclip className="size-3.5 shrink-0" aria-hidden="true" />
                            <span className="truncate" dir="auto">
                              {file.name}
                            </span>
                            <span dir="ltr" className="shrink-0 opacity-70">
                              ({formatBytes(file.size, locale)})
                            </span>
                          </a>
                        ) : (
                          <span className="inline-flex max-w-full items-center gap-1.5">
                            <Paperclip className="size-3.5 shrink-0" aria-hidden="true" />
                            <span className="truncate" dir="auto">
                              {file.name}
                            </span>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <p className="px-1 text-xs text-muted-foreground">
                {/* bdi isolates each fragment, so a Latin name next to Arabic text cannot reorder the line. */}
                <bdi>{message.author.name}</bdi> ·{' '}
                <bdi>
                  <time dateTime={message.dateTime}>{message.timeLabel}</time>
                </bdi>
              </p>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-2 border-t p-2 sm:p-3">
        {problems.length > 0 ? (
          <ul role="alert" className="space-y-1 text-xs text-destructive">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : null}
        {files.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted py-1 ps-3 pe-1 text-xs"
              >
                <span className="truncate" dir="auto">
                  {file.name}
                </span>
                <button
                  type="button"
                  aria-label={`${labels.removeAttachment}: ${file.name}`}
                  onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                  className="rounded-full p-1 hover:bg-background"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex items-end gap-2">
          <input
            ref={fileInput}
            type="file"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              addAttachments(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={labels.attach}
            disabled={disabled}
            onClick={() => fileInput.current?.click()}
          >
            <Paperclip />
          </Button>
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={labels.placeholder}
            aria-label={labels.placeholder}
            disabled={disabled}
            rows={1}
            dir="auto"
            className="max-h-32 min-h-10 flex-1 resize-none"
          />
          <Button
            type="submit"
            size="icon"
            aria-label={labels.send}
            disabled={disabled || (!text.trim() && files.length === 0)}
            loading={sending}
          >
            <Send className="rtl:-scale-x-100" />
          </Button>
        </div>
      </form>
    </div>
  );
}
