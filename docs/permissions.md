# Permissions

_Generated from `packages/contracts/src/permission-matrix.ts` by `pnpm --filter @medtravel/contracts docs:permissions`. Do not edit by hand._

Each cell lists the actions a role may take on a kind of record, then the **scope** (whose records) and, where the
role sees only part of a record, the **field groups**. A dash means no access. Data scoping is applied in one place,
`apps/api/src/rbac`; hospital users see only documents shared with their hospital by a live consent.

## Scopes

| Scope | Meaning |
| --- | --- |
| all | every record |
| own | the user's own records (their patient file, their notifications) |
| team | own cases plus the same team's; a manager sees all |
| city_window | cases in the user's city with a planned arrival within 30 days either way |
| hospital | cases sent to the user's hospital |
| assigned | cases assigned to the user (doctor: opinion requests; interpreter: bookings; reviewer: reviews) |
| referrals | cases referred by the user's agency |
| attached | cases the user is an invited attendant of |

## Field groups

**Case**

- `identity`: caseNo, patientName
- `stage`: stage, status, stageEnteredAt, urgency
- `travel`: plannedArrivalAt, plannedDepartureAt, preferredCityId, countryCode, preferredLanguage
- `medical`: treatmentId, diagnosis, medicalNotes
- `money`: budgetMinor, budgetCurrency
- `assignment`: ownerId, reviewerId, hospitalId
- `commercial`: source, campaign, agentId, lostReasonId, lostNote

**Patient**

- `name`: fullName
- `identity`: fullName, gender, dateOfBirth, nationalityCode
- `contact`: email, phone, address, emergencyContact
- `passport`: passportNumber, passportExpiry
- `medical`: medicalHistory, allergies

## Matrix by role

### Patient (`patient`)

| Subject | Access |
| --- | --- |
| MasterData | read (all) |
| Case | read, create, update (own) |
| Patient | read, update (own) |
| Document | read, create, update, delete (own) |
| MedicalSummary | read (own) |
| Opinion | read (own) |
| Quote | read, update (own) |
| Invoice | read (own) |
| Payment | read, create (own) |
| Refund | read, create (own) |
| Visa | read, update (own) |
| Booking | read (own) |
| Admission | read (own) |
| Hospital | read (all) |
| Agent | — |
| Commission | — |
| Payout | — |
| Task | — |
| Conversation | read, create, update (own) |
| Incident | — |
| Consent | read, create, update (own) |
| Feedback | read, create (own) |
| Notification | read, update (own) |
| NotificationLog | — |
| User | — |
| AuditLog | — |
| Report | — |
| Setting | — |

### Attendant (`attendant`)

| Subject | Access |
| --- | --- |
| MasterData | read (all) |
| Case | read (attached; fields: identity, stage, travel) |
| Patient | read (attached; fields: identity, contact) |
| Document | read, create (attached) |
| MedicalSummary | — |
| Opinion | — |
| Quote | — |
| Invoice | — |
| Payment | — |
| Refund | — |
| Visa | read, update (attached) |
| Booking | read (attached) |
| Admission | — |
| Hospital | read (all) |
| Agent | — |
| Commission | — |
| Payout | — |
| Task | — |
| Conversation | read, create, update (attached) |
| Incident | — |
| Consent | — |
| Feedback | — |
| Notification | read, update (own) |
| NotificationLog | — |
| User | — |
| AuditLog | — |
| Report | — |
| Setting | — |

### Agent (`agent`)

| Subject | Access |
| --- | --- |
| MasterData | read (all) |
| Case | read, create (referrals; fields: identity, stage) |
| Patient | read (referrals; fields: name) |
| Document | — |
| MedicalSummary | — |
| Opinion | — |
| Quote | — |
| Invoice | — |
| Payment | — |
| Refund | — |
| Visa | — |
| Booking | — |
| Admission | — |
| Hospital | read (all) |
| Agent | read, update (own) |
| Commission | read (own) |
| Payout | read (own) |
| Task | — |
| Conversation | — |
| Incident | — |
| Consent | — |
| Feedback | — |
| Notification | read, update (own) |
| NotificationLog | — |
| User | — |
| AuditLog | — |
| Report | — |
| Setting | — |

### Case manager (`case_manager`)

| Subject | Access |
| --- | --- |
| MasterData | read (all) |
| Case | read, create, update (team; fields: identity, stage, travel, medical, money, assignment, commercial) |
| Patient | read, create, update (team) |
| Document | read, create, update (team) |
| MedicalSummary | read (team) |
| Opinion | read (team) |
| Quote | read, create, update (team) |
| Invoice | read (team) |
| Payment | read (team) |
| Refund | read, create (team) |
| Visa | read, create, update (team) |
| Booking | read, create, update, delete (team) |
| Admission | read (team) |
| Hospital | read (all) |
| Agent | read (all) |
| Commission | read (team) |
| Payout | — |
| Task | read, create, update, delete (team) |
| Conversation | read, create, update (team) |
| Incident | read, update (team) |
| Consent | read (team) |
| Feedback | read (team) |
| Notification | read, update (own) |
| NotificationLog | — |
| User | — |
| AuditLog | — |
| Report | read, export (team) |
| Setting | — |

### Ground coordinator (`ground_coordinator`)

| Subject | Access |
| --- | --- |
| MasterData | read (all) |
| Case | read, update (city_window; fields: identity, stage, travel) |
| Patient | read (city_window; fields: identity, contact) |
| Document | — |
| MedicalSummary | — |
| Opinion | — |
| Quote | — |
| Invoice | — |
| Payment | — |
| Refund | — |
| Visa | — |
| Booking | read, update (city_window) |
| Admission | read (city_window) |
| Hospital | read (all) |
| Agent | — |
| Commission | — |
| Payout | — |
| Task | read, create, update (city_window) |
| Conversation | read, create, update (city_window) |
| Incident | read, create, update (city_window) |
| Consent | — |
| Feedback | — |
| Notification | read, update (own) |
| NotificationLog | — |
| User | — |
| AuditLog | — |
| Report | — |
| Setting | — |

### Interpreter (`interpreter`)

| Subject | Access |
| --- | --- |
| MasterData | read (all) |
| Case | read (assigned; fields: identity, stage, travel) |
| Patient | read (assigned; fields: identity) |
| Document | — |
| MedicalSummary | — |
| Opinion | — |
| Quote | — |
| Invoice | — |
| Payment | — |
| Refund | — |
| Visa | — |
| Booking | read, update (assigned) |
| Admission | — |
| Hospital | — |
| Agent | — |
| Commission | — |
| Payout | — |
| Task | read, update (assigned) |
| Conversation | read, create, update (assigned) |
| Incident | — |
| Consent | — |
| Feedback | — |
| Notification | read, update (own) |
| NotificationLog | — |
| User | — |
| AuditLog | — |
| Report | — |
| Setting | — |

### Medical reviewer (`medical_reviewer`)

| Subject | Access |
| --- | --- |
| MasterData | read (all) |
| Case | read, update (assigned; fields: identity, stage, travel, medical, assignment) |
| Patient | read (assigned; fields: identity, medical) |
| Document | read, create, update (assigned) |
| MedicalSummary | read, create, update (assigned) |
| Opinion | read (assigned) |
| Quote | — |
| Invoice | — |
| Payment | — |
| Refund | — |
| Visa | — |
| Booking | — |
| Admission | — |
| Hospital | read (all) |
| Agent | — |
| Commission | — |
| Payout | — |
| Task | read, create, update (assigned) |
| Conversation | read, create, update (assigned) |
| Incident | — |
| Consent | — |
| Feedback | — |
| Notification | read, update (own) |
| NotificationLog | — |
| User | — |
| AuditLog | — |
| Report | — |
| Setting | — |

### Hospital desk (`hospital_desk`)

| Subject | Access |
| --- | --- |
| MasterData | read (all) |
| Case | read, update (hospital; fields: identity, stage, travel, medical, assignment) |
| Patient | read (hospital; fields: identity, contact, passport, medical) |
| Document | read, create, update (hospital) |
| MedicalSummary | read (hospital) |
| Opinion | read, create, update (hospital) |
| Quote | — |
| Invoice | — |
| Payment | — |
| Refund | — |
| Visa | read, create, update (hospital) |
| Booking | — |
| Admission | read, create, update (hospital) |
| Hospital | read, update (hospital) |
| Agent | — |
| Commission | — |
| Payout | — |
| Task | read, update (hospital) |
| Conversation | read, create, update (hospital) |
| Incident | — |
| Consent | read (hospital) |
| Feedback | — |
| Notification | read, update (own) |
| NotificationLog | — |
| User | — |
| AuditLog | — |
| Report | read (hospital) |
| Setting | — |

### Doctor (`doctor`)

| Subject | Access |
| --- | --- |
| MasterData | read (all) |
| Case | read (assigned; fields: identity, stage, travel, medical) |
| Patient | read (assigned; fields: identity, medical) |
| Document | read (assigned) |
| MedicalSummary | read (assigned) |
| Opinion | read, create, update (assigned) |
| Quote | — |
| Invoice | — |
| Payment | — |
| Refund | — |
| Visa | — |
| Booking | — |
| Admission | read, update (assigned) |
| Hospital | read (all) |
| Agent | — |
| Commission | — |
| Payout | — |
| Task | — |
| Conversation | read, create, update (assigned) |
| Incident | — |
| Consent | — |
| Feedback | — |
| Notification | read, update (own) |
| NotificationLog | — |
| User | — |
| AuditLog | — |
| Report | — |
| Setting | — |

### Finance (`finance`)

| Subject | Access |
| --- | --- |
| MasterData | read (all) |
| Case | read (all; fields: identity, stage, money, assignment, commercial) |
| Patient | read (all; fields: identity) |
| Document | — |
| MedicalSummary | — |
| Opinion | — |
| Quote | read (all) |
| Invoice | read, create, update (all) |
| Payment | read, create, update (all) |
| Refund | read, create, update (all) |
| Visa | — |
| Booking | read (all) |
| Admission | — |
| Hospital | read (all) |
| Agent | read (all) |
| Commission | read, create, update (all) |
| Payout | read, create, update, export (all) |
| Task | — |
| Conversation | — |
| Incident | — |
| Consent | — |
| Feedback | — |
| Notification | read, update (own) |
| NotificationLog | — |
| User | — |
| AuditLog | — |
| Report | read, export (all) |
| Setting | — |

### Super admin (`super_admin`)

| Subject | Access |
| --- | --- |
| MasterData | read, create, update, delete, export (all) |
| Case | read, create, update, delete, export (all) |
| Patient | read, create, update, delete, export (all) |
| Document | read, create, update, delete, export (all) |
| MedicalSummary | read, create, update, delete, export (all) |
| Opinion | read, create, update, delete, export (all) |
| Quote | read, create, update, delete, export (all) |
| Invoice | read, create, update, delete, export (all) |
| Payment | read, create, update, delete, export (all) |
| Refund | read, create, update, delete, export (all) |
| Visa | read, create, update, delete, export (all) |
| Booking | read, create, update, delete, export (all) |
| Admission | read, create, update, delete, export (all) |
| Hospital | read, create, update, delete, export (all) |
| Agent | read, create, update, delete, export (all) |
| Commission | read, create, update, delete, export (all) |
| Payout | read, create, update, delete, export (all) |
| Task | read, create, update, delete, export (all) |
| Conversation | read, create, update, delete, export (all) |
| Incident | read, create, update, delete, export (all) |
| Consent | read, create, update, delete, export (all) |
| Feedback | read, create, update, delete, export (all) |
| Notification | read, create, update, delete, export (own) |
| NotificationLog | read, create, update, delete, export (all) |
| User | read, create, update, delete, export (all) |
| AuditLog | read, export (all) |
| Report | read, create, update, delete, export (all) |
| Setting | read, create, update, delete, export (all) |
