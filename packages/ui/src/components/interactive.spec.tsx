import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatPanel, type ChatPanelLabels } from './chat-panel';
import { ConfirmDialog } from './confirm-dialog';
import { FileUploader, type FileUploaderLabels } from './file-uploader';
import { MAX_UPLOAD_BYTES } from '../lib/files';

describe('ConfirmDialog', () => {
  const base = { title: 'Cancel case?', description: 'Cannot be undone', confirmLabel: 'Cancel case', cancelLabel: 'Keep', closeLabel: 'Close', errorLabel: 'Could not cancel the case' };

  it('is a labelled modal with an accessible close button', () => {
    render(<ConfirmDialog open onOpenChange={() => {}} onConfirm={() => {}} {...base} />);
    expect(screen.getByRole('dialog', { name: 'Cancel case?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('runs an async confirm, shows progress, then closes', async () => {
    let finish!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const onOpenChange = vi.fn();
    render(<ConfirmDialog open onOpenChange={onOpenChange} onConfirm={onConfirm} {...base} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel case' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Cancel case' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Keep' })).toBeDisabled();
    expect(onOpenChange).not.toHaveBeenCalled();
    await act(async () => finish());
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('stays open, says so, and reports the error when the confirm action fails', async () => {
    const onOpenChange = vi.fn();
    const onError = vi.fn();
    const failure = new Error('boom');
    render(<ConfirmDialog open onOpenChange={onOpenChange} onConfirm={() => Promise.reject(failure)} onError={onError} {...base} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel case' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not cancel the case');
    expect(onError).toHaveBeenCalledWith(failure);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // The buttons work again so the user can retry.
    expect(screen.getByRole('button', { name: 'Cancel case' })).not.toBeDisabled();
  });

  it('clears the error when the user retries and it succeeds', async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined);
    render(<ConfirmDialog open onOpenChange={onOpenChange} onConfirm={onConfirm} {...base} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel case' }));
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel case' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('cancels without confirming', async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(<ConfirmDialog open onOpenChange={onOpenChange} onConfirm={onConfirm} {...base} />);
    await userEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('ChatPanel', () => {
  const labels: ChatPanelLabels = { log: 'Messages', placeholder: 'Write a message', send: 'Send', attach: 'Attach', removeAttachment: 'Remove', empty: 'No messages' };
  const msg = { id: '1', author: { name: 'Asha' }, own: false, body: 'Hello', dateTime: '2026-03-02T09:30:00Z', timeLabel: '2 Mar' };

  it('shows messages in a live log and an empty message when there are none', () => {
    const { rerender } = render(<ChatPanel messages={[]} onSend={() => {}} labels={labels} />);
    expect(screen.getByText('No messages')).toBeInTheDocument();
    rerender(<ChatPanel messages={[msg]} onSend={() => {}} labels={labels} />);
    expect(screen.getByRole('log', { name: 'Messages' })).toHaveTextContent('Hello');
  });

  it('sends on Enter, adds a new line on Shift+Enter, and ignores empty text', async () => {
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} onSend={onSend} labels={labels} />);
    const box = screen.getByRole('textbox', { name: 'Write a message' });
    await userEvent.type(box, '{Enter}');
    expect(onSend).not.toHaveBeenCalled();
    await userEvent.type(box, 'line one{Shift>}{Enter}{/Shift}line two');
    expect(onSend).not.toHaveBeenCalled();
    await userEvent.type(box, '{Enter}');
    expect(onSend).toHaveBeenCalledWith({ text: 'line one\nline two', files: [] });
    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe(''));
  });

  it('does not send while an input method is composing text', () => {
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} onSend={onSend} labels={labels} />);
    const box = screen.getByRole('textbox', { name: 'Write a message' });
    fireEvent.change(box, { target: { value: 'مرحبا' } });
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('attaches files, lets them be removed, and sends the rest with the text', async () => {
    const onSend = vi.fn();
    const { container } = render(<ChatPanel messages={[]} onSend={onSend} labels={labels} />);
    const keep = new File(['y'], 'keep.pdf', { type: 'application/pdf' });
    const drop = new File(['x'], 'drop.pdf', { type: 'application/pdf' });
    await userEvent.upload(container.querySelector('input[type=file]') as HTMLInputElement, [drop, keep]);
    expect(screen.getByText('drop.pdf')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove: drop.pdf' }));
    expect(screen.queryByText('drop.pdf')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSend).toHaveBeenCalledWith({ text: '', files: [keep] });
  });

  it('disables the composer when told to', () => {
    render(<ChatPanel messages={[]} onSend={() => {}} labels={labels} disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });
});

describe('FileUploader', () => {
  const labels: FileUploaderLabels = {
    dropTitle: 'Drop files',
    dropHint: 'or browse',
    restrictionsHint: 'PDF up to 500 MB',
    remove: 'Remove',
    retry: 'Retry',
    cancelAll: 'Cancel all',
    uploading: 'Uploading',
    done: 'Done',
    failed: 'Failed',
    queued: 'Waiting',
    progress: (name) => `Progress of ${name}`,
    listLabel: 'Files',
    rejected: {
      too_large: (n) => `${n} is too large`,
      wrong_type: (n) => `${n} is the wrong type`,
      too_many: (n) => `${n} too many`,
      duplicate: (n) => `${n} duplicate`,
    },
  };
  const signRequest = vi.fn();

  function setup(props: Partial<React.ComponentProps<typeof FileUploader>> = {}) {
    const utils = render(<FileUploader signRequest={signRequest} labels={labels} allowedFileTypes={['application/pdf']} autoUpload={false} {...props} />);
    return { ...utils, input: utils.container.querySelector('input[type=file]') as HTMLInputElement };
  }
  const pdf = (name = 'report.pdf', size = 1024) => {
    const file = new File(['x'], name, { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: size });
    return file;
  };

  it('queues an allowed file without uploading when autoUpload is off', async () => {
    const { input } = setup();
    await userEvent.upload(input, pdf());
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progress of report.pdf' })).toHaveAttribute('aria-valuenow', '0');
    expect(signRequest).not.toHaveBeenCalled();
  });

  it('rejects a file over 500 MB with a translated message and does not queue it', async () => {
    const { input } = setup();
    fireEvent.change(input, { target: { files: [pdf('huge.pdf', MAX_UPLOAD_BYTES + 1)] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('huge.pdf is too large');
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('rejects a file type that is not allowed', async () => {
    const { input } = setup();
    fireEvent.change(input, { target: { files: [new File(['x'], 'virus.exe', { type: 'application/x-msdownload' })] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('virus.exe is the wrong type');
  });

  it('rejects the same file twice and enforces the file count', async () => {
    const { input } = setup({ maxNumberOfFiles: 1 });
    await userEvent.upload(input, pdf('a.pdf', 10));
    fireEvent.change(input, { target: { files: [pdf('b.pdf', 20)] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('b.pdf too many');
  });

  it('lets a queued file be removed and reports it', async () => {
    const onRemoved = vi.fn();
    const { input } = setup({ onRemoved });
    await userEvent.upload(input, pdf());
    await userEvent.click(screen.getByRole('button', { name: 'Remove: report.pdf' }));
    expect(screen.queryByText('report.pdf')).toBeNull();
    expect(onRemoved).toHaveBeenCalledTimes(1);
  });

  it('restricts the native file picker to the allowed types', () => {
    const { input } = setup();
    expect(input.getAttribute('accept')).toBe('application/pdf');
  });
});
