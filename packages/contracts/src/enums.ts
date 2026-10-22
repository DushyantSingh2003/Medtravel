import { z } from 'zod';

/**
 * Database enums (PRD section 11 and the screens of sections 5 to 9). `packages/db/prisma/schema.prisma` declares the same
 * values; `packages/db` has a test that fails when the two differ. Roles are in `roles.ts`, case stages and
 * statuses in `case-stages.ts`.
 */

/** Login state of a user. */
export const USER_STATUSES = ['invited', 'active', 'suspended', 'deactivated'] as const;
export const userStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof userStatusSchema>;

/** Patient gender. */
export const GENDERS = ['female', 'male', 'other', 'undisclosed'] as const;
export const genderSchema = z.enum(GENDERS);
export type Gender = z.infer<typeof genderSchema>;

/** How quickly a case needs treatment. */
export const URGENCIES = ['routine', 'soon', 'urgent', 'emergency'] as const;
export const urgencySchema = z.enum(URGENCIES);
export type Urgency = z.infer<typeof urgencySchema>;

/** Where a lead came from (PRD 6, lead inbox). */
export const CASE_SOURCES = ['website', 'whatsapp', 'phone', 'email', 'agent', 'referral', 'walk_in', 'other'] as const;
export const caseSourceSchema = z.enum(CASE_SOURCES);
export type CaseSource = z.infer<typeof caseSourceSchema>;

/** Broad category of a stored file (PRD 11). */
export const DOCUMENT_KINDS = ['report', 'scan', 'prescription', 'passport', 'visa', 'invoice', 'bill', 'discharge', 'invitation_letter', 'photo', 'pickup_photo', 'kyc', 'agreement', 'other'] as const;
export const documentKindSchema = z.enum(DOCUMENT_KINDS);
export type DocumentKind = z.infer<typeof documentKindSchema>;

/** private: the patient and our staff, and any hospital with a live DocumentShare; internal: our staff only. Hospital access is never a flag: it is a DocumentShare row. */
export const DOCUMENT_VISIBILITIES = ['private', 'internal'] as const;
export const documentVisibilitySchema = z.enum(DOCUMENT_VISIBILITIES);
export type DocumentVisibility = z.infer<typeof documentVisibilitySchema>;

/** Result of the virus scan on an uploaded file. */
export const SCAN_STATUSES = ['pending', 'clean', 'infected', 'failed'] as const;
export const scanStatusSchema = z.enum(SCAN_STATUSES);
export type ScanStatus = z.infer<typeof scanStatusSchema>;

/** What a patient agreed to. */
export const CONSENT_TYPES = ['data_processing', 'share_medical_with_hospital', 'share_stage_with_agent', 'marketing', 'public_review', 'whatsapp_contact'] as const;
export const consentTypeSchema = z.enum(CONSENT_TYPES);
export type ConsentType = z.infer<typeof consentTypeSchema>;

/** Onboarding and publishing state of a hospital profile. */
export const HOSPITAL_STATUSES = ['draft', 'pending_review', 'approved', 'published', 'unpublished', 'suspended'] as const;
export const hospitalStatusSchema = z.enum(HOSPITAL_STATUSES);
export type HospitalStatus = z.infer<typeof hospitalStatusSchema>;

/** Who issued an accreditation. */
export const ACCREDITATION_BODIES = ['nabh', 'jci', 'nabl', 'iso', 'other'] as const;
export const accreditationBodySchema = z.enum(ACCREDITATION_BODIES);
export type AccreditationBody = z.infer<typeof accreditationBodySchema>;

/** Where a request to a hospital stands. */
export const OPINION_REQUEST_STATUSES = ['draft', 'sent', 'viewed', 'accepted', 'declined', 'answered', 'expired', 'cancelled'] as const;
export const opinionRequestStatusSchema = z.enum(OPINION_REQUEST_STATUSES);
export type OpinionRequestStatus = z.infer<typeof opinionRequestStatusSchema>;

/** Quote lifecycle. */
export const QUOTE_STATUSES = ['draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'superseded'] as const;
export const quoteStatusSchema = z.enum(QUOTE_STATUSES);
export type QuoteStatus = z.infer<typeof quoteStatusSchema>;

/** What a quote line is for. */
export const QUOTE_LINE_KINDS = ['hospital', 'stay', 'transfer', 'interpreter', 'service_fee', 'add_on', 'discount', 'other'] as const;
export const quoteLineKindSchema = z.enum(QUOTE_LINE_KINDS);
export type QuoteLineKind = z.infer<typeof quoteLineKindSchema>;

/** Deposit, our service fee, a hospital pass-through (not revenue), an add-on, or a hospital paying its referral fee. */
export const PAYMENT_TYPES = ['deposit', 'service', 'pass_through', 'add_on', 'referral_fee'] as const;
export const paymentTypeSchema = z.enum(PAYMENT_TYPES);
export type PaymentType = z.infer<typeof paymentTypeSchema>;

/** How a payment was made. */
export const PAYMENT_METHODS = ['card', 'bank_wire', 'upi', 'payment_link', 'cash', 'other'] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/** Payment lifecycle. */
export const PAYMENT_STATUSES = ['pending', 'authorized', 'succeeded', 'failed', 'cancelled', 'partially_refunded', 'refunded', 'chargeback'] as const;
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

/** Invoice to a patient for our fees, or to a hospital for the referral fee. */
export const INVOICE_KINDS = ['service_fee', 'referral_fee'] as const;
export const invoiceKindSchema = z.enum(INVOICE_KINDS);
export type InvoiceKind = z.infer<typeof invoiceKindSchema>;

/** Invoice lifecycle. */
export const INVOICE_STATUSES = ['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void'] as const;
export const invoiceStatusSchema = z.enum(INVOICE_STATUSES);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

/** Credit note lifecycle. */
export const CREDIT_NOTE_STATUSES = ['draft', 'issued', 'void'] as const;
export const creditNoteStatusSchema = z.enum(CREDIT_NOTE_STATUSES);
export type CreditNoteStatus = z.infer<typeof creditNoteStatusSchema>;

/** Refund lifecycle. */
export const REFUND_STATUSES = ['requested', 'approved', 'rejected', 'processed', 'failed'] as const;
export const refundStatusSchema = z.enum(REFUND_STATUSES);
export type RefundStatus = z.infer<typeof refundStatusSchema>;

/** Visa category. */
export const VISA_TYPES = ['medical', 'medical_attendant', 'other'] as const;
export const visaTypeSchema = z.enum(VISA_TYPES);
export type VisaType = z.infer<typeof visaTypeSchema>;

/** Visa tracker status (PRD 6). */
export const VISA_STATUSES = ['not_started', 'documents_pending', 'invitation_requested', 'invitation_issued', 'applied', 'approved', 'rejected', 'expired'] as const;
export const visaStatusSchema = z.enum(VISA_STATUSES);
export type VisaStatus = z.infer<typeof visaStatusSchema>;

/** Kind of booking (PRD 11). */
export const BOOKING_TYPES = ['flight', 'stay', 'transfer', 'interpreter', 'sim', 'other'] as const;
export const bookingTypeSchema = z.enum(BOOKING_TYPES);
export type BookingType = z.infer<typeof bookingTypeSchema>;

/** Booking lifecycle (en_route and picked_up are for transfers). */
export const BOOKING_STATUSES = ['requested', 'confirmed', 'en_route', 'picked_up', 'in_progress', 'completed', 'cancelled'] as const;
export const bookingStatusSchema = z.enum(BOOKING_STATUSES);
export type BookingStatus = z.infer<typeof bookingStatusSchema>;

/** What a vendor supplies. */
export const VENDOR_KINDS = ['stay', 'transport', 'interpreter', 'sim', 'travel', 'other'] as const;
export const vendorKindSchema = z.enum(VENDOR_KINDS);
export type VendorKind = z.infer<typeof vendorKindSchema>;

/** Kind of partner accommodation. */
export const STAY_TYPES = ['guest_house', 'hotel', 'service_apartment'] as const;
export const stayTypeSchema = z.enum(STAY_TYPES);
export type StayType = z.infer<typeof stayTypeSchema>;

/** Kind of vehicle. */
export const VEHICLE_TYPES = ['sedan', 'suv', 'van', 'wheelchair', 'ambulance'] as const;
export const vehicleTypeSchema = z.enum(VEHICLE_TYPES);
export type VehicleType = z.infer<typeof vehicleTypeSchema>;

/** Agent onboarding state. */
export const AGENT_STATUSES = ['applied', 'kyc_review', 'approved', 'suspended', 'rejected'] as const;
export const agentStatusSchema = z.enum(AGENT_STATUSES);
export type AgentStatus = z.infer<typeof agentStatusSchema>;

/** Agent tier (PRD 8, phase 3). */
export const AGENT_TIERS = ['silver', 'gold', 'platinum'] as const;
export const agentTierSchema = z.enum(AGENT_TIERS);
export type AgentTier = z.infer<typeof agentTierSchema>;

/** Commission lifecycle. */
export const COMMISSION_STATUSES = ['earned', 'approved', 'paid', 'cancelled'] as const;
export const commissionStatusSchema = z.enum(COMMISSION_STATUSES);
export type CommissionStatus = z.infer<typeof commissionStatusSchema>;

/** Agent payout lifecycle. */
export const PAYOUT_STATUSES = ['requested', 'approved', 'processing', 'paid', 'failed', 'cancelled'] as const;
export const payoutStatusSchema = z.enum(PAYOUT_STATUSES);
export type PayoutStatus = z.infer<typeof payoutStatusSchema>;

/** How an agent is paid. */
export const PAYOUT_METHODS = ['international_wire', 'local_transfer'] as const;
export const payoutMethodSchema = z.enum(PAYOUT_METHODS);
export type PayoutMethod = z.infer<typeof payoutMethodSchema>;

/** Task lifecycle. */
export const TASK_STATUSES = ['open', 'in_progress', 'done', 'cancelled'] as const;
export const taskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

/** Task priority. */
export const TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const taskPrioritySchema = z.enum(TASK_PRIORITIES);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

/** Channel a message travelled on. */
export const MESSAGE_CHANNELS = ['in_app', 'whatsapp', 'email', 'sms'] as const;
export const messageChannelSchema = z.enum(MESSAGE_CHANNELS);
export type MessageChannel = z.infer<typeof messageChannelSchema>;

/** inbound from the other party, outbound to them. Staff-only notes are CaseNote, not messages. */
export const MESSAGE_DIRECTIONS = ['inbound', 'outbound'] as const;
export const messageDirectionSchema = z.enum(MESSAGE_DIRECTIONS);
export type MessageDirection = z.infer<typeof messageDirectionSchema>;

/** Who the conversation is with. */
export const CONVERSATION_KINDS = ['patient', 'hospital', 'agent', 'internal'] as const;
export const conversationKindSchema = z.enum(CONVERSATION_KINDS);
export type ConversationKind = z.infer<typeof conversationKindSchema>;

/** Channel a notification is sent on. */
export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'whatsapp', 'sms', 'push'] as const;
export const notificationChannelSchema = z.enum(NOTIFICATION_CHANNELS);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

/** Delivery state. */
export const NOTIFICATION_STATUSES = ['queued', 'sent', 'delivered', 'read', 'failed'] as const;
export const notificationStatusSchema = z.enum(NOTIFICATION_STATUSES);
export type NotificationStatus = z.infer<typeof notificationStatusSchema>;

/** Kind of incident (PRD 6). */
export const INCIDENT_TYPES = ['complaint', 'medical_complication', 'lost_documents', 'delay', 'other'] as const;
export const incidentTypeSchema = z.enum(INCIDENT_TYPES);
export type IncidentType = z.infer<typeof incidentTypeSchema>;

/** How serious an incident is. */
export const INCIDENT_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export const incidentSeveritySchema = z.enum(INCIDENT_SEVERITIES);
export type IncidentSeverity = z.infer<typeof incidentSeveritySchema>;

/** Incident lifecycle. */
export const INCIDENT_STATUSES = ['open', 'escalated', 'resolved', 'closed'] as const;
export const incidentStatusSchema = z.enum(INCIDENT_STATUSES);
export type IncidentStatus = z.infer<typeof incidentStatusSchema>;

/** Where a hospital stay stands. */
export const ADMISSION_STATUSES = ['planned', 'admitted', 'discharged', 'cancelled'] as const;
export const admissionStatusSchema = z.enum(ADMISSION_STATUSES);
export type AdmissionStatus = z.infer<typeof admissionStatusSchema>;

/** Outbox event state; the worker moves events along. */
export const OUTBOX_STATUSES = ['pending', 'processing', 'processed', 'failed'] as const;
export const outboxStatusSchema = z.enum(OUTBOX_STATUSES);
export type OutboxStatus = z.infer<typeof outboxStatusSchema>;

/** How an interpreter works with us. */
export const INTERPRETER_EMPLOYMENTS = ['in_house', 'freelance'] as const;
export const interpreterEmploymentSchema = z.enum(INTERPRETER_EMPLOYMENTS);
export type InterpreterEmployment = z.infer<typeof interpreterEmploymentSchema>;
