import { z } from 'zod';
import type { NotificationChannel } from './enums.js';

/** Who an event is for. `system` events (a quarantined file, a test) go to whoever the code names. */
export const NOTIFICATION_AUDIENCES = ['patient', 'internal', 'agent', 'system'] as const;
export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];

/**
 * - `security`: cannot be switched off by the person (a quarantined upload, an incident);
 * - `reminder`: time-driven reminders;
 * - `update`: something changed on a case.
 */
export const NOTIFICATION_CATEGORIES = ['security', 'reminder', 'update'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export interface NotificationEventDef {
  audience: NotificationAudience;
  category: NotificationCategory;
  /** Channels used when the person has not chosen otherwise, in the order they are tried. */
  channels: readonly NotificationChannel[];
  /** The `{placeholders}` the texts may use; also the ordered parameters of the WhatsApp template. */
  variables: readonly string[];
}

const PATIENT_CHANNELS = ['whatsapp', 'email', 'in_app'] as const;
const URGENT_PATIENT_CHANNELS = ['whatsapp', 'sms', 'email', 'in_app'] as const;
const INTERNAL_CHANNELS = ['in_app', 'email'] as const;
const AGENT_CHANNELS = ['whatsapp', 'email', 'in_app'] as const;

const patient = (
  variables: readonly string[],
  category: NotificationCategory = 'update',
  channels: readonly NotificationChannel[] = PATIENT_CHANNELS,
): NotificationEventDef => ({ audience: 'patient', category, channels, variables });
const internal = (variables: readonly string[]): NotificationEventDef => ({
  audience: 'internal',
  category: 'update',
  channels: INTERNAL_CHANNELS,
  variables,
});
const agent = (variables: readonly string[]): NotificationEventDef => ({
  audience: 'agent',
  category: 'update',
  channels: AGENT_CHANNELS,
  variables,
});

/**
 * Every event the platform can notify about (PRD section 10) with its audience, channels and variables. The texts, in English and
 * Arabic, are in `packages/notifications`; a spec there fails when an event has no text or a text uses an undeclared variable.
 */
export const NOTIFICATION_EVENTS = {
  // ---- patient
  enquiry_received: patient(['patientName', 'caseNumber']),
  coordinator_assigned: patient([
    'patientName',
    'coordinatorName',
    'coordinatorWhatsapp',
    'caseNumber',
  ]),
  reports_missing: patient(['patientName', 'caseNumber', 'missingReports']),
  reports_received: patient(['patientName', 'caseNumber']),
  opinions_ready: patient(['patientName', 'caseNumber', 'opinionCount']),
  quote_sent: patient(['patientName', 'caseNumber', 'quoteNumber', 'total']),
  quote_expiring: patient(['patientName', 'quoteNumber', 'expiryDate'], 'reminder'),
  payment_received: patient(['patientName', 'amount', 'invoiceNumber']),
  invitation_letter_ready: patient(['patientName', 'hospitalName']),
  visa_approved: patient(['patientName', 'validUntil']),
  visa_refused: patient(['patientName', 'coordinatorName']),
  itinerary_confirmed: patient(['patientName', 'arrivalDate', 'flight']),
  pickup_24h: patient(
    ['patientName', 'driverName', 'driverPhone', 'vehicle', 'pickupTime'],
    'reminder',
    URGENT_PATIENT_CHANNELS,
  ),
  pickup_2h: patient(
    ['patientName', 'driverName', 'driverPhone', 'vehicle', 'pickupTime'],
    'reminder',
    URGENT_PATIENT_CHANNELS,
  ),
  appointment_reminder: patient(
    ['patientName', 'doctorName', 'hospitalName', 'appointmentTime'],
    'reminder',
    URGENT_PATIENT_CHANNELS,
  ),
  daily_treatment_update: patient(['patientName', 'updateText']),
  discharge_summary_uploaded: patient(['patientName', 'hospitalName']),
  followup_teleconsult_reminder: patient(
    ['patientName', 'doctorName', 'appointmentTime'],
    'reminder',
  ),
  feedback_request: patient(['patientName', 'feedbackLink']),
  // ---- internal alerts
  new_lead: internal(['leadName', 'country', 'treatment', 'caseNumber']),
  sla_breach: internal(['caseNumber', 'slaName', 'overdueBy']),
  hospital_response_overdue: internal(['caseNumber', 'hospitalName', 'dueDate']),
  bill_over_estimate: internal(['caseNumber', 'estimate', 'actual']),
  arrival_tomorrow: internal(['patientName', 'caseNumber', 'arrivalTime', 'flight']),
  incident_logged: {
    audience: 'internal',
    category: 'security',
    channels: INTERNAL_CHANNELS,
    variables: ['severity'],
  },
  payment_failed: internal(['caseNumber', 'amount', 'reason']),
  // ---- agent alerts
  referral_stage_changed: agent(['patientInitials', 'caseNumber', 'stage']),
  commission_earned: agent(['amount', 'caseNumber']),
  payout_sent: agent(['amount', 'reference']),
  // ---- system
  document_quarantined: {
    audience: 'system',
    category: 'security',
    channels: ['in_app', 'email'],
    variables: [],
  },
  test_event: {
    audience: 'system',
    category: 'update',
    channels: ['whatsapp', 'email', 'in_app'],
    variables: ['name'],
  },
} as const satisfies Record<string, NotificationEventDef>;

export type NotificationEventKey = keyof typeof NOTIFICATION_EVENTS;
export const NOTIFICATION_EVENT_KEYS = Object.keys(NOTIFICATION_EVENTS) as NotificationEventKey[];
export const notificationEventKeySchema = z.enum(
  NOTIFICATION_EVENT_KEYS as [NotificationEventKey, ...NotificationEventKey[]],
);

/** Languages with a text for every event; a person with any other language gets English. */
export const NOTIFICATION_LOCALES = ['en', 'ar'] as const;
export type NotificationLocale = (typeof NOTIFICATION_LOCALES)[number];

export function notificationLocale(language: string | null | undefined): NotificationLocale {
  const base = (language ?? 'en').toLowerCase().split('-')[0];
  return base === 'ar' ? 'ar' : 'en';
}

/** The WhatsApp template an event is sent as; names must match what is approved at the provider. */
export function whatsappTemplateName(key: NotificationEventKey): string {
  return `mt_${key}`;
}

/** Channels that can carry a message to a person; `push` is not built yet. */
export const DELIVERABLE_CHANNELS = ['in_app', 'email', 'whatsapp', 'sms'] as const;
export type DeliverableChannel = (typeof DELIVERABLE_CHANNELS)[number];
export const PREFERENCE_CHANNELS = ['email', 'whatsapp', 'sms'] as const;
