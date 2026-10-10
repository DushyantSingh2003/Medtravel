import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CASE_STAGES, type CaseStage } from '@medtravel/contracts';
import { initialsOf } from './avatar';
import { Breadcrumbs } from './breadcrumbs';
import { EmptyState, ErrorState } from './empty-state';
import { StageTracker } from './stage-tracker';
import { StatCard } from './stat-card';
import { StatusBadge } from './status-badge';
import { Timeline } from './timeline';

const stageLabels = Object.fromEntries(CASE_STAGES.map((s) => [s, `Stage ${s}`])) as Record<
  CaseStage,
  string
>;
const trackerLabels = {
  title: 'Case progress',
  stages: stageLabels,
  done: 'completed',
  current: 'current stage',
  upcoming: 'upcoming',
};

describe('StageTracker', () => {
  it('lists all twelve stages in order and marks exactly one as current', () => {
    render(<StageTracker current="visa" labels={trackerLabels} />);
    const items = within(screen.getByRole('navigation', { name: 'Case progress' })).getAllByRole(
      'listitem',
    );
    expect(items).toHaveLength(12);
    expect(items.filter((li) => li.getAttribute('aria-current') === 'step')).toHaveLength(1);
    expect(items[6]).toHaveAttribute('aria-current', 'step');
  });

  it('conveys progress in text, not only colour', () => {
    render(<StageTracker current="visa" labels={trackerLabels} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('completed');
    expect(items[6]).toHaveTextContent('current stage');
    expect(items[11]).toHaveTextContent('upcoming');
    expect(items.filter((li) => li.dataset.state === 'done')).toHaveLength(6);
  });

  it('handles the first and last stage', () => {
    const { rerender } = render(<StageTracker current="enquiry" labels={trackerLabels} />);
    expect(
      screen.getAllByRole('listitem').filter((li) => li.dataset.state === 'done'),
    ).toHaveLength(0);
    rerender(<StageTracker current="follow_up" labels={trackerLabels} />);
    expect(
      screen.getAllByRole('listitem').filter((li) => li.dataset.state === 'done'),
    ).toHaveLength(11);
  });
});

describe('StatusBadge', () => {
  it('shows the translated label it is given and exposes the status', () => {
    render(<StatusBadge status="in_treatment" label="In treatment" />);
    expect(screen.getByText('In treatment').closest('[data-status]')).toHaveAttribute(
      'data-status',
      'in_treatment',
    );
  });

  it('colours exit statuses as problems and on-hold as a warning', () => {
    const { rerender } = render(<StatusBadge status="lost" label="Lost" />);
    expect(screen.getByText('Lost').closest('span')?.className).toContain('destructive');
    rerender(<StatusBadge status="on_hold" label="On hold" />);
    expect(screen.getByText('On hold').closest('span')?.className).toContain('warning');
  });
});

describe('Timeline', () => {
  it('renders each event with a machine-readable time', () => {
    render(
      <Timeline
        label="History"
        items={[
          { id: '1', title: 'Created', dateTime: '2026-03-01T04:00:00Z', timeLabel: '1 Mar 2026' },
          {
            id: '2',
            title: 'Quote accepted',
            description: 'By the patient',
            dateTime: '2026-03-04T10:45:00Z',
            timeLabel: '4 Mar 2026',
          },
        ]}
      />,
    );
    const list = screen.getByRole('list', { name: 'History' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('4 Mar 2026')).toHaveAttribute('datetime', '2026-03-04T10:45:00Z');
    expect(screen.getByText('By the patient')).toBeInTheDocument();
  });
});

describe('Breadcrumbs', () => {
  it('links the earlier items and marks the last as the current page', () => {
    render(
      <Breadcrumbs
        label="Breadcrumb"
        items={[
          { label: 'Home', href: '/' },
          { label: 'Cases', href: '/cases' },
          { label: 'CASE-1' },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Cases' })).toHaveAttribute('href', '/cases');
    expect(screen.getByText('CASE-1')).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'CASE-1' })).toBeNull();
  });

  it('uses the router link component when given one', () => {
    const Link = ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
      <a href={href} data-router="yes" {...rest}>
        {children}
      </a>
    );
    render(
      <Breadcrumbs
        label="Breadcrumb"
        linkComponent={Link}
        items={[{ label: 'Home', href: '/' }, { label: 'Here' }]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('data-router', 'yes');
  });
});

describe('EmptyState and ErrorState', () => {
  it('shows an empty state with its action', () => {
    render(
      <EmptyState title="No cases" description="Nothing here" action={<button>Add</button>} />,
    );
    expect(screen.getByRole('heading', { name: 'No cases' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('announces an error and offers a retry', async () => {
    const onRetry = vi.fn();
    render(<ErrorState title="Failed" retryLabel="Try again" onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('hides the retry button when there is no handler', () => {
    render(<ErrorState title="Failed" retryLabel="Try again" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('initialsOf', () => {
  it('takes the first letters of the first and last word, in Latin and Arabic', () => {
    expect(initialsOf('Asha Verma')).toBe('AV');
    expect(initialsOf('Omar Al-Farsi')).toBe('OA');
    expect(initialsOf('محمد علي')).toBe('مع');
    expect(initialsOf('Cher')).toBe('C');
    expect(initialsOf('  ')).toBe('?');
  });
});

describe('StatCard', () => {
  it('shows the value and a spoken trend, hiding the symbol from screen readers', () => {
    render(
      <StatCard
        label="New leads"
        value="1,284"
        delta={{ value: '+12%', trend: 'up', srLabel: 'up 12 percent' }}
      />,
    );
    expect(screen.getByText('1,284')).toBeInTheDocument();
    expect(screen.getByText('up 12 percent')).toHaveClass('sr-only');
    expect(screen.getByText('+12%')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows a placeholder, not the value, while loading', () => {
    render(<StatCard label="Revenue" value="$5" loading />);
    expect(screen.queryByText('$5')).toBeNull();
  });
});
