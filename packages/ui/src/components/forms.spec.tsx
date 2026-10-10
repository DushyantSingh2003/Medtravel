import { zodResolver } from '@hookform/resolvers/zod';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Combobox } from './combobox';
import { CurrencyInput } from './currency-input';
import { FormCheckbox, FormInput } from './form-fields';
import { PhoneInput } from './phone-input';

describe('CurrencyInput', () => {
  function Harness({
    currency = 'USD',
    onValue,
  }: {
    currency?: string;
    onValue: (v: number | null) => void;
  }) {
    const [value, setValue] = useState<number | null>(null);
    return (
      <CurrencyInput
        aria-label="Amount"
        value={value}
        currency={currency}
        locale="en"
        onChange={(v) => {
          setValue(v);
          onValue(v);
        }}
      />
    );
  }

  it('turns typed decimals into integer minor units without float error', async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    await userEvent.type(screen.getByLabelText('Amount'), '19.99');
    expect(onValue).toHaveBeenLastCalledWith(1999);
  });

  it('shows the formatted amount when the field loses focus and the plain number when focused again', async () => {
    render(<Harness onValue={() => {}} />);
    const input = screen.getByLabelText('Amount') as HTMLInputElement;
    await userEvent.type(input, '1234.5');
    await userEvent.tab();
    expect(input.value).toBe('$1,234.50');
    await userEvent.click(input);
    expect(input.value).toBe('1234.50');
  });

  it('reports null for empty or invalid text', async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    await userEvent.type(screen.getByLabelText('Amount'), 'abc');
    expect(onValue).toHaveBeenLastCalledWith(null);
  });

  it('follows an external value change, such as a form reset', () => {
    const { rerender } = render(
      <CurrencyInput
        aria-label="Amount"
        value={1050}
        currency="USD"
        locale="en"
        onChange={() => {}}
      />,
    );
    const input = screen.getByLabelText('Amount') as HTMLInputElement;
    expect(input.value).toBe('$10.50');
    rerender(
      <CurrencyInput
        aria-label="Amount"
        value={2500}
        currency="USD"
        locale="en"
        onChange={() => {}}
      />,
    );
    expect(input.value).toBe('$25.00');
    rerender(
      <CurrencyInput
        aria-label="Amount"
        value={null}
        currency="USD"
        locale="en"
        onChange={() => {}}
      />,
    );
    expect(input.value).toBe('');
  });

  it('renders the formatted value on first paint', () => {
    const { container } = render(
      <CurrencyInput
        aria-label="Amount"
        value={123456}
        currency="USD"
        locale="en"
        onChange={() => {}}
      />,
    );
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('$1,234.56');
  });

  it('keeps unparseable text and flags it instead of erasing it on blur', async () => {
    render(<Harness onValue={() => {}} />);
    const input = screen.getByLabelText('Amount') as HTMLInputElement;
    await userEvent.type(input, '1.2.3');
    await userEvent.tab();
    expect(input.value).toBe('1.2.3');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('supports negative amounts such as refunds', async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    await userEvent.type(screen.getByLabelText('Amount'), '-10.50');
    expect(onValue).toHaveBeenLastCalledWith(-1050);
  });

  it('respects currencies without minor units', async () => {
    const onValue = vi.fn();
    render(<Harness currency="JPY" onValue={onValue} />);
    await userEvent.type(screen.getByLabelText('Amount'), '1500');
    expect(onValue).toHaveBeenLastCalledWith(1500);
  });
});

describe('PhoneInput', () => {
  const labels = { country: 'Country code', searchCountry: 'Search', noCountry: 'None' };

  it('reports E.164 once the number is valid, and an empty string while it is not', async () => {
    const onChange = vi.fn();
    render(
      <PhoneInput value="" onChange={onChange} locale="en" labels={labels} aria-label="Phone" />,
    );
    const input = screen.getByLabelText('Phone');
    await userEvent.type(input, '98765');
    expect(onChange).toHaveBeenLastCalledWith('');
    await userEvent.type(input, '43210');
    expect(onChange).toHaveBeenLastCalledWith('+919876543210');
  });

  it('formats the national number as you type for the chosen country', async () => {
    render(
      <PhoneInput value="" onChange={() => {}} locale="en" labels={labels} aria-label="Phone" />,
    );
    await userEvent.type(screen.getByLabelText('Phone'), '9876543210');
    expect((screen.getByLabelText('Phone') as HTMLInputElement).value).toBe('98765 43210');
  });

  it('follows an external value change instead of keeping stale digits', () => {
    const { rerender } = render(
      <PhoneInput
        value="+919876543210"
        onChange={() => {}}
        locale="en"
        labels={labels}
        aria-label="Phone"
      />,
    );
    const input = screen.getByLabelText('Phone') as HTMLInputElement;
    expect(input.value).toBe('98765 43210');
    rerender(
      <PhoneInput
        value="+971501234567"
        onChange={() => {}}
        locale="en"
        labels={labels}
        aria-label="Phone"
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Country code' })).toHaveTextContent('+971');
    rerender(
      <PhoneInput value="" onChange={() => {}} locale="en" labels={labels} aria-label="Phone" />,
    );
    expect(input.value).toBe('');
  });

  it('does not treat a shared calling code as the default country', () => {
    render(
      <PhoneInput
        value="+12025550123"
        onChange={() => {}}
        locale="en"
        labels={labels}
        aria-label="Phone"
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Country code' })).toHaveTextContent('+1');
    expect((screen.getByLabelText('Phone') as HTMLInputElement).value).toMatch(/202/);
  });

  it('shows an existing E.164 value for its country', () => {
    render(
      <PhoneInput
        value="+971501234567"
        onChange={() => {}}
        locale="en"
        labels={labels}
        aria-label="Phone"
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Country code' })).toHaveTextContent('+971');
  });
});

describe('Combobox', () => {
  it('filters the list as you type and selects with the keyboard', async () => {
    const onChange = vi.fn();
    render(
      <Combobox
        options={[
          { value: 'delhi', label: 'Delhi' },
          { value: 'mumbai', label: 'Mumbai' },
          { value: 'chennai', label: 'Chennai' },
        ]}
        value={null}
        onChange={onChange}
        placeholder="Choose"
        searchPlaceholder="Search"
        emptyLabel="Nothing"
      />,
    );
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.type(await screen.findByPlaceholderText('Search'), 'mum');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('mumbai');
  });

  it('shows the empty message when nothing matches', async () => {
    render(
      <Combobox
        options={[{ value: 'a', label: 'Alpha' }]}
        value={null}
        onChange={() => {}}
        placeholder="Choose"
        searchPlaceholder="Search"
        emptyLabel="Nothing"
      />,
    );
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.type(await screen.findByPlaceholderText('Search'), 'zzz');
    expect(screen.getByText('Nothing')).toBeInTheDocument();
  });
});

describe('FormField wiring', () => {
  const schema = z.object({
    email: z.string().email('Enter a valid email'),
    consent: z.literal(true, { error: 'Consent is required' }),
  });
  type Values = z.infer<typeof schema>;

  function Harness({ onSubmit }: { onSubmit: (v: Values) => void }) {
    const form = useForm<Values>({
      resolver: zodResolver(schema),
      defaultValues: { email: '', consent: false as never },
    });
    return (
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FormInput
          control={form.control}
          name="email"
          label="Email"
          description="We email quotes"
          required
          requiredLabel="required"
        />
        <FormCheckbox control={form.control} name="consent" label="I consent" />
        <button type="submit">Submit</button>
        <button
          type="button"
          onClick={() => form.setError('email', { message: 'Already registered' })}
        >
          Server error
        </button>
      </form>
    );
  }

  it('links label, hint and error to the control and announces the error', async () => {
    render(<Harness onSubmit={() => {}} />);
    const input = screen.getByLabelText(/Email/);
    expect(input).toHaveAttribute('aria-invalid', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    const alert = await screen.findByText('Enter a valid email');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const described = input.getAttribute('aria-describedby') ?? '';
    expect(described.split(' ')).toContain(alert.id);
    expect(described.split(' ')).toContain(screen.getByText('We email quotes').id);
  });

  it('marks required fields for screen readers as well as visually', () => {
    render(<Harness onSubmit={() => {}} />);
    expect(screen.getByText('(required)')).toHaveClass('sr-only');
  });

  it('shows a server-side error through the same path as a client error', async () => {
    render(<Harness onSubmit={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Server error' }));
    expect(await screen.findByText('Already registered')).toHaveAttribute('role', 'alert');
    expect(screen.getByLabelText(/Email/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('submits typed values once valid, and a checkbox contributes a boolean', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/Email/), 'a@b.co');
    await userEvent.click(screen.getByRole('checkbox', { name: 'I consent' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ email: 'a@b.co', consent: true });
  });

  it('does not submit while a field is invalid', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await act(async () => {});
    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText('Consent is required')).toBeInTheDocument();
  });
});
