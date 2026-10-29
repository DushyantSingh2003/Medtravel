import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell, type AppShellProps } from './app-shell';
import { BrandMark } from './brand-mark';
import { NotificationsMenu } from './notifications-menu';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import { Switcher } from './switcher';
import { UserMenu } from './user-menu';
import { WhatsAppButton } from './whatsapp-button';

const shellLabels = {
  skipToContent: 'Skip to content',
  navigation: 'Main navigation',
  openMenu: 'Open menu',
  closeMenu: 'Close menu',
  collapse: 'Collapse sidebar',
  expand: 'Expand sidebar',
};

function shell(props: Partial<AppShellProps> = {}) {
  return (
    <AppShell
      brand={<span>MedTravel</span>}
      brandCompact={<BrandMark />}
      labels={shellLabels}
      storageKey="test:shell"
      activeId="cases"
      topBar={<span>top bar content</span>}
      sections={[
        {
          id: 'main',
          label: 'Workspace',
          items: [
            { id: 'overview', label: 'Overview', href: '/overview' },
            { id: 'cases', label: 'Cases', href: '/cases' },
          ],
        },
      ]}
      {...props}
    >
      <p>page body</p>
    </AppShell>
  );
}

describe('AppShell', () => {
  beforeEach(() => window.localStorage.clear());

  it('lists the navigation, marks the current page and offers a skip link to the page', () => {
    render(shell());
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getByRole('link', { name: 'Cases' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
    const main = screen.getByRole('main');
    expect(main).toHaveTextContent('page body');
    expect(screen.getByText('Skip to content')).toHaveAttribute('href', `#${main.id}`);
    expect(screen.getByText('top bar content')).toBeInTheDocument();
  });

  it('collapses to icons, keeps the names for screen readers, and remembers the choice', async () => {
    const { unmount } = render(shell());
    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(toggle).not.toHaveAttribute('aria-expanded');
    await userEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
    // The link is still named, only visually hidden.
    expect(screen.getByRole('link', { name: 'Cases' })).toBeInTheDocument();
    expect(window.localStorage.getItem('test:shell')).toBe('1');

    unmount();
    render(shell());
    expect(await screen.findByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
  });

  it('still works when storage is blocked', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(shell());
    await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    // The choice still takes effect, kept in memory.
    expect(await screen.findByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it('opens the navigation as a panel from the menu button and closes it after choosing a page', async () => {
    render(shell());
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const dialog = await screen.findByRole('dialog');
    const link = within(dialog).getByRole('link', { name: 'Overview' });
    fireEvent.click(link);
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes the panel when the logo is used, not only the menu links', async () => {
    render(shell({ brand: <a href="/home">MedTravel home</a> }));
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('link', { name: 'MedTravel home' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('uses plain containers instead of page landmarks when embedded', () => {
    render(shell({ contained: true }));
    expect(screen.queryByRole('main')).toBeNull();
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});

describe('Switcher', () => {
  const options = [
    { value: 'en', label: 'English' },
    { value: 'ar', label: 'العربية' },
  ];

  it('is named by what it switches and shows the current choice', () => {
    render(<Switcher label="Language" value="ar" options={options} onValueChange={() => {}} />);
    expect(screen.getByRole('button', { name: /Language:.*العربية/ })).toBeInTheDocument();
  });

  it('reports the chosen value', async () => {
    const onValueChange = vi.fn();
    render(
      <Switcher label="Language" value="en" options={options} onValueChange={onValueChange} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Language/ }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'العربية' }));
    expect(onValueChange).toHaveBeenCalledWith('ar');
  });

  it('shows the short form on the button when given', () => {
    render(
      <Switcher
        label="Currency"
        value="USD"
        options={[{ value: 'USD', label: 'US dollar', short: 'USD' }]}
        onValueChange={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /USD/ })).toBeInTheDocument();
  });
});

describe('UserMenu', () => {
  it('names the button with the user and runs an action', async () => {
    const onSelect = vi.fn();
    render(
      <UserMenu
        label="Account menu"
        heading="Signed in as"
        name="Asha Verma"
        description="Case manager"
        items={[{ id: 'out', label: 'Sign out', onSelect }]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Account menu.*Asha Verma/ }));
    expect(await screen.findByText('Case manager')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('renders link items as links', async () => {
    render(
      <UserMenu
        label="Account menu"
        name="Asha"
        items={[{ id: 'profile', label: 'Profile', href: '/profile' }]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Account menu/ }));
    expect(await screen.findByRole('menuitem', { name: 'Profile' })).toHaveAttribute(
      'href',
      '/profile',
    );
  });
});

describe('NotificationsMenu', () => {
  const unreadLabel = (count: number) => `${count} unread`;

  it('puts the unread count in the button name', () => {
    render(
      <NotificationsMenu
        label="Notifications"
        emptyLabel="Nothing new"
        unreadLabel={unreadLabel}
        items={[
          { id: '1', title: 'New lead', timeLabel: '5 min', unread: true },
          { id: '2', title: 'Quote accepted', timeLabel: '1 h' },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Notifications, 1 unread' })).toBeInTheDocument();
  });

  it('shows the empty message and no count when there is nothing', async () => {
    render(
      <NotificationsMenu
        label="Notifications"
        emptyLabel="Nothing new"
        unreadLabel={unreadLabel}
        items={[]}
      />,
    );
    const button = screen.getByRole('button', { name: 'Notifications' });
    await userEvent.click(button);
    expect(await screen.findByText('Nothing new')).toBeInTheDocument();
  });

  it('shows the true unread count when the list is only the latest page', () => {
    render(
      <NotificationsMenu
        label="Notifications"
        emptyLabel="Nothing new"
        unreadLabel={unreadLabel}
        unreadCount={14}
        items={[{ id: '1', title: 'New lead', timeLabel: '5 min', unread: true }]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Notifications, 14 unread' })).toBeInTheDocument();
  });

  it('tells the app which notification was opened, and offers to mark all as read only while some are unread', async () => {
    const onItemSelect = vi.fn();
    const onMarkAllRead = vi.fn();
    const props = {
      label: 'Notifications',
      emptyLabel: 'Nothing new',
      unreadLabel,
      markAllLabel: 'Mark all as read',
      onItemSelect,
      onMarkAllRead,
    };
    const { rerender } = render(
      <NotificationsMenu
        {...props}
        items={[
          { id: 'n1', title: 'New lead', body: 'From Kenya', timeLabel: '5 min', unread: true },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /^Notifications/ }));
    await userEvent.click(await screen.findByRole('button', { name: /New lead/ }));
    expect(onItemSelect).toHaveBeenCalledWith('n1');
    await userEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    expect(onMarkAllRead).toHaveBeenCalledOnce();

    rerender(
      <NotificationsMenu
        {...props}
        items={[{ id: 'n1', title: 'New lead', timeLabel: '5 min', unread: false }]}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument();
  });

  it('shows a loading state and an error state instead of the list', async () => {
    const { rerender } = render(
      <NotificationsMenu
        label="Notifications"
        emptyLabel="Nothing new"
        unreadLabel={unreadLabel}
        loadingLabel="Loading notifications"
        errorLabel="Could not load your notifications."
        status="loading"
        items={[]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(
      await screen.findByRole('status', { name: 'Loading notifications' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Nothing new')).not.toBeInTheDocument();

    rerender(
      <NotificationsMenu
        label="Notifications"
        emptyLabel="Nothing new"
        unreadLabel={unreadLabel}
        loadingLabel="Loading notifications"
        errorLabel="Could not load your notifications."
        status="error"
        items={[]}
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load your notifications.',
    );
  });
});

describe('SiteHeader and SiteFooter', () => {
  const headerLabels = {
    skipToContent: 'Skip',
    navigation: 'Site navigation',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
  };
  const nav = [
    { id: 'treatments', label: 'Treatments', href: '/treatments' },
    { id: 'about', label: 'About', href: '/about' },
  ];

  it('marks the current section and links the skip link to the page', () => {
    render(
      <SiteHeader
        brand={<span>MedTravel</span>}
        nav={nav}
        activeId="about"
        actions={<span>actions</span>}
        labels={headerLabels}
      />,
    );
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Skip')).toHaveAttribute('href', '#main-content');
  });

  it('can omit the skip link when embedded', () => {
    render(<SiteHeader mainId={null} brand="x" nav={nav} actions={null} labels={headerLabels} />);
    expect(screen.queryByText('Skip')).toBeNull();
  });

  it('opens the menu as a panel with the mobile actions', async () => {
    render(
      <SiteHeader
        brand="x"
        nav={nav}
        actions={null}
        mobileActions={<button>Get a quote</button>}
        labels={headerLabels}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'Treatments' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Get a quote' })).toBeInTheDocument();
  });

  it('closes the panel when the call to action inside it is used', async () => {
    render(
      <SiteHeader
        brand="x"
        nav={nav}
        actions={null}
        mobileActions={<a href="/quote">Get a quote</a>}
        labels={headerLabels}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('link', { name: 'Get a quote' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('renders footer columns, legal links and the copyright line', () => {
    render(
      <SiteFooter
        brand={<span>MedTravel</span>}
        tagline="Treatment in India"
        navigationLabel="Footer"
        legalLabel="Legal"
        copyright="© 2026 MedTravel"
        columns={[
          {
            id: 'a',
            title: 'For patients',
            links: [{ id: 't', label: 'Treatments', href: '/treatments' }],
          },
        ]}
        legal={[{ id: 'p', label: 'Privacy', href: '/privacy' }]}
      />,
    );
    expect(
      within(screen.getByRole('navigation', { name: 'Footer' })).getByRole('link', {
        name: 'Treatments',
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: 'Legal' })).getByRole('link', {
        name: 'Privacy',
      }),
    ).toHaveAttribute('href', '/privacy');
    expect(screen.getByText('© 2026 MedTravel')).toBeInTheDocument();
  });
});

describe('WhatsAppButton', () => {
  it('is a named link that opens safely in a new tab', () => {
    render(<WhatsAppButton href="https://wa.me/919999900000" label="Chat on WhatsApp" />);
    const link = screen.getByRole('link', { name: 'Chat on WhatsApp' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });
});
