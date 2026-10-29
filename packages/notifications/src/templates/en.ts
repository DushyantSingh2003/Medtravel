import type { MessageTexts } from './types.js';

export const EN: MessageTexts = {
  enquiry_received: {
    title: 'We received your enquiry',
    body: 'Hello {patientName}, thank you for contacting MedTravel. Your case number is {caseNumber}. A coordinator will contact you shortly.',
  },
  coordinator_assigned: {
    title: 'Your coordinator is {coordinatorName}',
    body: 'Hello {patientName}, {coordinatorName} will look after case {caseNumber}. You can message them on WhatsApp: {coordinatorWhatsapp}',
  },
  reports_missing: {
    title: 'We need more reports',
    body: 'Hello {patientName}, to continue with case {caseNumber} please upload: {missingReports}.',
  },
  reports_received: {
    title: 'Your reports have arrived',
    body: 'Hello {patientName}, we received your medical reports for case {caseNumber}. Our doctors will review them now.',
  },
  opinions_ready: {
    title: 'Your medical opinions are ready',
    body: 'Hello {patientName}, {opinionCount} hospital opinion(s) are ready for case {caseNumber}. Sign in to compare them.',
  },
  quote_sent: {
    title: 'Your quote is ready',
    body: 'Hello {patientName}, quote {quoteNumber} for case {caseNumber} is ready. Total: {total}. Sign in to review and accept it.',
  },
  quote_expiring: {
    title: 'Your quote expires soon',
    body: 'Hello {patientName}, quote {quoteNumber} is valid until {expiryDate}. Please accept it before then to keep the price.',
  },
  payment_received: {
    title: 'Payment received',
    body: 'Hello {patientName}, we received your payment of {amount}. Invoice {invoiceNumber} is attached to your case.',
  },
  invitation_letter_ready: {
    title: 'Your invitation letter is ready',
    body: 'Hello {patientName}, the invitation letter from {hospitalName} is ready. You can download it from your case.',
  },
  visa_approved: {
    title: 'Your visa is approved',
    body: 'Hello {patientName}, good news: your medical visa is approved and valid until {validUntil}.',
  },
  visa_refused: {
    title: 'About your visa application',
    body: 'Hello {patientName}, your visa application was not approved. {coordinatorName} will contact you about the next steps.',
  },
  itinerary_confirmed: {
    title: 'Your travel plan is confirmed',
    body: 'Hello {patientName}, you arrive on {arrivalDate} on flight {flight}. The full itinerary is in your case.',
  },
  pickup_24h: {
    title: 'Your airport pickup is tomorrow',
    body: 'Hello {patientName}, your driver {driverName} ({driverPhone}) will meet you at {pickupTime} in a {vehicle}.',
  },
  pickup_2h: {
    title: 'Your driver is on the way',
    body: 'Hello {patientName}, your driver {driverName} ({driverPhone}) will meet you at {pickupTime} in a {vehicle}.',
  },
  appointment_reminder: {
    title: 'Appointment reminder',
    body: 'Hello {patientName}, you have an appointment with {doctorName} at {hospitalName} on {appointmentTime}.',
  },
  daily_treatment_update: {
    title: 'Today’s treatment update',
    body: 'Update for the family of {patientName}: {updateText}',
  },
  discharge_summary_uploaded: {
    title: 'Your discharge summary is available',
    body: 'Hello {patientName}, {hospitalName} has uploaded your discharge summary. You can read it in your records.',
  },
  followup_teleconsult_reminder: {
    title: 'Follow-up consultation reminder',
    body: 'Hello {patientName}, your follow-up video consultation with {doctorName} is on {appointmentTime}.',
  },
  feedback_request: {
    title: 'How was your experience?',
    body: 'Hello {patientName}, we would be grateful for your feedback. It takes two minutes: {feedbackLink}',
  },
  new_lead: {
    title: 'New lead: {leadName}',
    body: 'A new enquiry from {country} about {treatment} was received (case {caseNumber}).',
  },
  sla_breach: {
    title: 'SLA breached on {caseNumber}',
    body: 'The {slaName} deadline for case {caseNumber} passed {overdueBy} ago.',
  },
  hospital_response_overdue: {
    title: 'Hospital response overdue',
    body: '{hospitalName} has not answered case {caseNumber}; it was due on {dueDate}.',
  },
  bill_over_estimate: {
    title: 'Bill is over the estimate',
    body: 'Case {caseNumber}: the bill is {actual}, above the estimate of {estimate}.',
  },
  arrival_tomorrow: {
    title: 'Arrival tomorrow: {patientName}',
    body: '{patientName} (case {caseNumber}) arrives tomorrow at {arrivalTime} on flight {flight}.',
  },
  incident_logged: {
    title: 'New {severity} incident',
    body: 'A new incident needs attention. Open the incidents list or the audit log for details.',
  },
  payment_failed: {
    title: 'Payment failed',
    body: 'A payment of {amount} for case {caseNumber} failed: {reason}.',
  },
  referral_stage_changed: {
    title: 'Referral update',
    body: 'Your referral {patientInitials} (case {caseNumber}) moved to: {stage}.',
  },
  commission_earned: {
    title: 'Commission earned',
    body: 'You earned a commission of {amount} on case {caseNumber}.',
  },
  payout_sent: {
    title: 'Payout sent',
    body: 'A payout of {amount} was sent to you. Reference: {reference}.',
  },
  document_quarantined: {
    title: 'A file could not be accepted',
    body: 'A file you uploaded did not pass our safety check and was removed. Please check it and upload it again.',
  },
  test_event: {
    title: 'Test notification',
    body: 'Hello {name}, this is a test message from MedTravel. If you can read it, this channel works.',
  },
};
