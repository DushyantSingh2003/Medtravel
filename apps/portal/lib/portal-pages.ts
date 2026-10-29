// Generated once from the PRD screen list (sections 5.2, 6, 7, 8, 9); edit by hand from here on.
import type { Portal } from '@medtravel/contracts';

/** PRD priority: P0 launch, P1 phase 2, P2 phase 3. */
export type Priority = 'P0' | 'P1' | 'P2';

/** Names of the lucide icons the navigation uses; see `portal-icons.tsx`. */
export type PageIcon =
  | 'Activity'
  | 'BadgePercent'
  | 'Banknote'
  | 'BarChart3'
  | 'BedDouble'
  | 'BedSingle'
  | 'Bell'
  | 'Briefcase'
  | 'Building2'
  | 'Calculator'
  | 'Car'
  | 'CircleOff'
  | 'ClipboardPen'
  | 'Coins'
  | 'CreditCard'
  | 'Database'
  | 'FileCheck2'
  | 'FileSpreadsheet'
  | 'FileText'
  | 'FolderOpen'
  | 'Gift'
  | 'GraduationCap'
  | 'HeartPulse'
  | 'History'
  | 'Hospital'
  | 'Hotel'
  | 'Inbox'
  | 'Kanban'
  | 'Landmark'
  | 'Languages'
  | 'LayoutDashboard'
  | 'ListChecks'
  | 'Mail'
  | 'MapPin'
  | 'Megaphone'
  | 'MessageSquare'
  | 'MessagesSquare'
  | 'Network'
  | 'Package'
  | 'PenSquare'
  | 'Phone'
  | 'PieChart'
  | 'Plane'
  | 'PlaneLanding'
  | 'Plug'
  | 'Receipt'
  | 'ScrollText'
  | 'Send'
  | 'ShieldAlert'
  | 'Shuffle'
  | 'Siren'
  | 'Stamp'
  | 'Star'
  | 'Stethoscope'
  | 'TrendingUp'
  | 'Trophy'
  | 'Truck'
  | 'Undo2'
  | 'Upload'
  | 'UserCheck'
  | 'UserPlus'
  | 'Users'
  | 'Video'
  | 'Wallet';

export interface PortalPage {
  /** URL segment and message key: `/{portal}/{key}`, text at `nav.{portal}.{key}`. */
  key: string;
  icon: PageIcon;
  priority: Priority;
  /** Navigation group, text at `navSections.{portal}.{section}`. */
  section: string;
}

export interface PortalDefinition {
  /** The page served at the portal root, `/{portal}`. */
  home: string;
  sections: readonly string[];
  pages: readonly PortalPage[];
}

export const PORTAL_DEFINITIONS: Record<Portal, PortalDefinition> = {
  patient: {
    home: 'dashboard',
    sections: ['journey', 'money', 'support'],
    pages: [
      { key: 'dashboard', icon: 'LayoutDashboard', priority: 'P0', section: 'journey' },
      { key: 'records', icon: 'FolderOpen', priority: 'P0', section: 'journey' },
      { key: 'quotes', icon: 'FileCheck2', priority: 'P0', section: 'journey' },
      { key: 'consult', icon: 'Video', priority: 'P1', section: 'journey' },
      { key: 'follow-up', icon: 'HeartPulse', priority: 'P1', section: 'journey' },
      { key: 'payments', icon: 'CreditCard', priority: 'P0', section: 'money' },
      { key: 'expenses', icon: 'Receipt', priority: 'P1', section: 'money' },
      { key: 'visa', icon: 'Stamp', priority: 'P0', section: 'money' },
      { key: 'itinerary', icon: 'Plane', priority: 'P0', section: 'money' },
      { key: 'stay', icon: 'BedDouble', priority: 'P1', section: 'money' },
      { key: 'messages', icon: 'MessageSquare', priority: 'P0', section: 'support' },
      { key: 'feedback', icon: 'Star', priority: 'P0', section: 'support' },
      { key: 'referrals', icon: 'Gift', priority: 'P2', section: 'support' },
      { key: 'emergency', icon: 'Siren', priority: 'P1', section: 'support' },
    ],
  },
  ops: {
    home: 'overview',
    sections: ['sales', 'cases', 'comms', 'field', 'setup'],
    pages: [
      { key: 'overview', icon: 'LayoutDashboard', priority: 'P0', section: 'sales' },
      { key: 'leads', icon: 'Inbox', priority: 'P0', section: 'sales' },
      { key: 'assignment', icon: 'Shuffle', priority: 'P0', section: 'sales' },
      { key: 'pipeline', icon: 'Kanban', priority: 'P0', section: 'cases' },
      { key: 'cases', icon: 'Briefcase', priority: 'P0', section: 'cases' },
      { key: 'medical-summary', icon: 'Stethoscope', priority: 'P0', section: 'cases' },
      { key: 'hospital-requests', icon: 'Send', priority: 'P0', section: 'cases' },
      { key: 'quotes', icon: 'Calculator', priority: 'P0', section: 'cases' },
      { key: 'visa', icon: 'Stamp', priority: 'P0', section: 'cases' },
      { key: 'tasks', icon: 'ListChecks', priority: 'P0', section: 'cases' },
      { key: 'messages', icon: 'MessagesSquare', priority: 'P0', section: 'comms' },
      { key: 'calls', icon: 'Phone', priority: 'P1', section: 'comms' },
      { key: 'templates', icon: 'FileText', priority: 'P0', section: 'comms' },
      { key: 'logistics', icon: 'Truck', priority: 'P0', section: 'field' },
      { key: 'ground', icon: 'MapPin', priority: 'P1', section: 'field' },
      { key: 'updates', icon: 'Activity', priority: 'P1', section: 'field' },
      { key: 'incidents', icon: 'ShieldAlert', priority: 'P0', section: 'setup' },
      { key: 'lost-reasons', icon: 'CircleOff', priority: 'P0', section: 'setup' },
    ],
  },
  hospital: {
    home: 'overview',
    sections: ['cases', 'catalogue', 'insights'],
    pages: [
      { key: 'overview', icon: 'LayoutDashboard', priority: 'P0', section: 'cases' },
      { key: 'requests', icon: 'Inbox', priority: 'P0', section: 'cases' },
      { key: 'opinions', icon: 'ClipboardPen', priority: 'P0', section: 'cases' },
      { key: 'invitations', icon: 'Mail', priority: 'P0', section: 'cases' },
      { key: 'admissions', icon: 'BedSingle', priority: 'P0', section: 'cases' },
      { key: 'doctor', icon: 'Stethoscope', priority: 'P0', section: 'cases' },
      { key: 'teleconsult', icon: 'Video', priority: 'P1', section: 'cases' },
      { key: 'onboarding', icon: 'Building2', priority: 'P0', section: 'catalogue' },
      { key: 'packages', icon: 'Package', priority: 'P0', section: 'catalogue' },
      { key: 'branches', icon: 'Network', priority: 'P1', section: 'catalogue' },
      { key: 'statements', icon: 'ScrollText', priority: 'P0', section: 'insights' },
      { key: 'performance', icon: 'TrendingUp', priority: 'P1', section: 'insights' },
      { key: 'api', icon: 'Plug', priority: 'P2', section: 'insights' },
    ],
  },
  agent: {
    home: 'overview',
    sections: ['referrals', 'earnings', 'grow'],
    pages: [
      { key: 'overview', icon: 'LayoutDashboard', priority: 'P0', section: 'referrals' },
      { key: 'registration', icon: 'UserPlus', priority: 'P0', section: 'referrals' },
      { key: 'refer', icon: 'Send', priority: 'P0', section: 'referrals' },
      { key: 'referrals', icon: 'Users', priority: 'P0', section: 'referrals' },
      { key: 'commission', icon: 'Coins', priority: 'P0', section: 'earnings' },
      { key: 'payouts', icon: 'Banknote', priority: 'P0', section: 'earnings' },
      { key: 'marketing', icon: 'Megaphone', priority: 'P1', section: 'grow' },
      { key: 'sub-agents', icon: 'Network', priority: 'P1', section: 'grow' },
      { key: 'leaderboard', icon: 'Trophy', priority: 'P2', section: 'grow' },
      { key: 'training', icon: 'GraduationCap', priority: 'P1', section: 'grow' },
    ],
  },
  admin: {
    home: 'overview',
    sections: ['admin', 'finance', 'logistics'],
    pages: [
      { key: 'overview', icon: 'LayoutDashboard', priority: 'P0', section: 'admin' },
      { key: 'users', icon: 'Users', priority: 'P0', section: 'admin' },
      { key: 'masters', icon: 'Database', priority: 'P0', section: 'admin' },
      { key: 'hospital-approvals', icon: 'Building2', priority: 'P0', section: 'admin' },
      { key: 'agent-approvals', icon: 'UserCheck', priority: 'P0', section: 'admin' },
      { key: 'cms', icon: 'PenSquare', priority: 'P0', section: 'admin' },
      { key: 'pricing', icon: 'BadgePercent', priority: 'P0', section: 'admin' },
      { key: 'templates', icon: 'FileText', priority: 'P0', section: 'admin' },
      { key: 'audit', icon: 'History', priority: 'P0', section: 'admin' },
      { key: 'notifications', icon: 'Bell', priority: 'P0', section: 'admin' },
      { key: 'reports', icon: 'BarChart3', priority: 'P0', section: 'admin' },
      { key: 'invoicing', icon: 'FileSpreadsheet', priority: 'P0', section: 'finance' },
      { key: 'payments', icon: 'CreditCard', priority: 'P0', section: 'finance' },
      { key: 'refunds', icon: 'Undo2', priority: 'P0', section: 'finance' },
      { key: 'referral-fees', icon: 'Hospital', priority: 'P0', section: 'finance' },
      { key: 'commissions', icon: 'Coins', priority: 'P0', section: 'finance' },
      { key: 'deposits', icon: 'Landmark', priority: 'P1', section: 'finance' },
      { key: 'vendor-payables', icon: 'Wallet', priority: 'P1', section: 'finance' },
      { key: 'accounting-export', icon: 'Upload', priority: 'P1', section: 'finance' },
      { key: 'profit', icon: 'PieChart', priority: 'P1', section: 'finance' },
      { key: 'stays', icon: 'Hotel', priority: 'P0', section: 'logistics' },
      { key: 'transport', icon: 'Car', priority: 'P0', section: 'logistics' },
      { key: 'interpreters', icon: 'Languages', priority: 'P0', section: 'logistics' },
      { key: 'welcome-kit', icon: 'Gift', priority: 'P2', section: 'logistics' },
      { key: 'flights', icon: 'PlaneLanding', priority: 'P0', section: 'logistics' },
    ],
  },
};
