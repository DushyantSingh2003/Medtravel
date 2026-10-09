# Medical Tourism Platform — Product Requirements Document

2026-10-09
## 1. Overview

We are building an end-to-end medical travel platform that brings international patients to accredited Indian hospitals and manages every step from first enquiry in their home country to safe return and follow-up. The product is five connected portals on one backend, run by an in-house operations team. Brand name is a placeholder ("the Platform") until decided.

**Problem.** Foreign patients struggle to compare Indian hospitals, get honest price estimates, arrange medical visas, and manage stay, language and money in an unfamiliar country. Today this is handled by informal agents over WhatsApp, with little transparency and no accountability. Hospitals in turn get unqualified leads and have no single view of incoming international patients.

**Vision.** One trusted place where a patient sends their reports, receives two or three hospital opinions with fixed package prices within 48 hours, and is then looked after by a named coordinator until they are home and recovering.

**Goals for the first 12 months**

- Launch the patient website, coordinator portal, hospital portal, agent portal and admin portal (MVP in 4 months).

- Onboard 10 or more NABH/JCI hospitals in 2 to 3 Indian cities with signed package-price agreements.

- Serve 3 source markets first (to be confirmed, e.g. Iraq, Uzbekistan, Kenya/Nigeria) in English, Arabic, Russian and French.

- Reach a steady flow of converted patients each month with a quote turnaround under 48 hours.

- Obtain NABH Medical Value Travel Facilitator (MVTF) empanelment.

**In scope**

- Inbound medical travel to India: enquiry, opinions, quotes, visa support, travel, stay, airport transfer, interpreter, in-hospital coordination, payments, discharge, return, teleconsult follow-up.

- Wellness and AYUSH packages as an add-on category.

- Web first (responsive), Android and iOS patient app in phase 2.

**Out of scope (for now)**

- Outbound travel (Indians going abroad) and non-India destinations.

- Providing medical treatment, issuing visas, or holding a travel agency licence for ticketing (we book through partners).

- Insurance underwriting (we integrate with insurers, we don't sell cover).

## 2. Users and roles

Eleven roles use the system; each sees only the portal and data their role needs (role-based access control).

| Role                        | Portal                        | Who they are                                          | Main jobs                                                                                 |
|-----------------------------|-------------------------------|-------------------------------------------------------|-------------------------------------------------------------------------------------------|
| Patient                     | Website + patient portal/app  | Foreign national needing treatment                    | Submit case, compare quotes, pay, track journey, chat, upload documents                   |
| Attendant                   | Patient portal (linked)       | Family member travelling with patient                 | View itinerary, chat, upload passport for visa                                            |
| Agent / referral partner    | Agent portal                  | Freelancer, clinic or travel agency in source country | Refer patients, track their cases, see commission                                         |
| Case manager                | Coordinator portal            | In-house sales/medical coordinator                    | Qualify lead, get opinions, send quote, convert                                           |
| Ground coordinator          | Coordinator portal (mobile)   | Staff in Indian city                                  | Airport pickup, check-in, hospital escort, daily updates                                  |
| Interpreter                 | Coordinator portal (limited)  | In-house or freelance                                 | Accept assignments, log hours                                                             |
| Hospital international desk | Hospital portal               | International patient department staff                | Receive cases, send opinion + estimate, issue visa invitation, update admission and bills |
| Doctor                      | Hospital portal (doctor view) | Treating specialist                                   | Review reports, give opinion, run teleconsults                                            |
| Medical reviewer            | Coordinator portal            | Our in-house doctor (MBBS/MD)                         | Check reports are complete, summarise case, sanity-check treatment plans                  |
| Finance                     | Admin portal                  | Accounts team                                         | Invoices, payments, refunds, hospital and agent settlements                               |
| Super admin                 | Admin portal                  | Founders / ops head                                   | Configure everything, users, content, reports                                             |

## 3. End-to-end patient journey

Every patient is one **Case** that moves through 12 stages; each stage has an owner, a target time, and an automatic message to the patient when it changes.

1.  **Enquiry** (patient or agent) — Patient fills the free-quote form, WhatsApp bot or agent submits on their behalf. Case created, assigned to a case manager within 15 minutes in working hours.

2.  **Qualification** (case manager) — First call or chat within 2 hours. Confirm diagnosis, budget, preferred city, travel dates, language. Request medical reports.

3.  **Medical review** (medical reviewer) — Check reports are complete and readable, write a one-page case summary, pick 3 suitable hospitals/doctors.

4.  **Hospital opinions** (hospital desk + doctor) — Case sent to selected hospitals through the hospital portal. Each returns treatment plan, length of stay and cost estimate within 48 hours.

5.  **Quote and decision** (case manager → patient) — Patient sees side-by-side comparison in their portal, can book a video consult with the doctor, then selects a hospital and accepts the package.

6.  **Booking and deposit** (patient, finance) — Patient pays advance (hospital deposit and/or our service package) online. Admission date fixed.

7.  **Visa** (hospital desk, case manager) — Hospital generates the medical invitation letter on the government Medical and Ayush Visa Portal; we upload it to the case, guide patient and attendants through e-Medical / e-Medical Attendant visa application, track status.

8.  **Travel planning** (case manager) — Flights booked through travel partner (or patient's own), stay booked in partner guest house/hotel near hospital, itinerary published to the patient app.

9.  **Arrival** (ground coordinator) — Airport pickup with name board, local SIM, currency exchange, drop at stay, welcome kit. Interpreter assigned if needed.

10. **Treatment** (hospital, ground coordinator) — Escort to OPD and admission, daily status update to family, bill tracking against estimate, FRRO formalities if stay is extended.

11. **Discharge and return** (hospital, ground coordinator) — Discharge summary and final bill uploaded, fit-to-fly confirmed, medicines arranged, airport drop.

12. **Follow-up** (doctor, case manager) — Teleconsults at 1 week, 1 month and 3 months (configurable), feedback and review request, case closed. Referral invite sent.

**Exit stages** (can happen at any point): Lost (reason required: price, chose another country, no response, visa refused, medically unfit), On hold, Cancelled with refund.

**Case status values** for filters and reports: New · Qualifying · In medical review · Awaiting opinions · Quote sent · Won (booked) · Visa in process · Travel booked · Arrived · In treatment · Discharged · Returned home · Follow-up · Closed · Lost · On hold · Cancelled.

## 4. System overview

All six front ends talk to one backend API, which owns every business rule (who sees what, SLA timers, quote and commission maths), so an update made in one portal shows everywhere at once.

*(Diagram in the PRD doc: system overview · 6 front ends, 1 API, data and external services)*

The government Medical and Ayush Visa Portal is used by hospitals directly and is not integrated; its invitation letters are uploaded into the case.

## 5. Public website and patient portal

The website wins trust and captures enquiries; the patient portal (web, later app) is where a converted patient lives for the whole journey. Priority: P0 = MVP, P1 = phase 2, P2 = phase 3.

### 5.1 Public website

| Feature                | Requirement                                                                                                                                      | Priority            |
|------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------|---------------------|
| Home page              | Search by treatment/condition, trust badges (NABH/JCI partners, MVTF), patient video stories, how-it-works in 4 steps, WhatsApp and call buttons | P0                  |
| Treatment pages        | Per procedure: overview, who needs it, India price range vs home country/USA/UK, stay length, success factors, FAQs, "Get free quote"            | P0                  |
| Hospital pages         | Accreditations, specialities, city, international desk facilities, photos, featured doctors, packages                                            | P0                  |
| Doctor pages           | Qualification, experience, specialities, languages, hospital, procedures, "Ask this doctor"                                                      | P0                  |
| City/destination pages | Delhi NCR, Mumbai, Chennai etc.: hospitals, stay options, weather, how to reach                                                                  | P1                  |
| Cost estimator         | Treatment + city + room category → price range with inclusions; captures contact before showing detail                                           | P0                  |
| Free quote form        | Multi-step: condition, country, age, reports upload (PDF/JPG/DICOM zip up to 500 MB), contact, preferred language; consent checkbox              | P0                  |
| Compare                | Compare up to 3 hospitals or packages side by side                                                                                               | P1                  |
| Multi-language         | English, Arabic (RTL), Russian, French at launch; Swahili, Amharic, Uzbek later. Language and currency switcher (USD, EUR, INR, AED)             | P0 (EN/AR), P1 rest |
| Blog and guides        | Visa guide, cost guides, patient stories; built for SEO with schema markup                                                                       | P0                  |
| Become a partner       | Lead forms for hospitals and agents                                                                                                              | P0                  |
| AI assistant           | Chat that answers FAQs and books a callback; never gives medical diagnosis                                                                       | P2                  |
| Legal pages            | Privacy policy, terms, refund policy, medical disclaimer, grievance officer contact                                                              | P0                  |

### 5.2 Patient portal and app

| Feature               | Requirement                                                                                                       | Priority |
|-----------------------|-------------------------------------------------------------------------------------------------------------------|----------|
| Sign-up / login       | Email or phone OTP (WhatsApp OTP supported), social login optional; attendants invited by patient                 | P0       |
| My case dashboard     | Current stage on a progress tracker, next action, assigned coordinator with photo and WhatsApp link               | P0       |
| Medical records vault | Upload/download reports, scans, prescriptions, discharge summary; tags by type; share with chosen hospitals only  | P0       |
| Opinions and quotes   | View each hospital's plan, doctor, stay, cost breakdown and inclusions; accept a quote digitally                  | P0       |
| Video consult         | Book a slot with the doctor, pay fee, join via in-app video link                                                  | P1       |
| Payments              | Pay deposit, service package and add-ons by card, bank wire, UPI (where possible); download receipts and invoices | P0       |
| Visa centre           | Checklist per nationality, upload passport/photo, download invitation letter, visa status tracker                 | P0       |
| Itinerary             | Flights, pickup time, driver name and car, stay address with map, appointments calendar                           | P0       |
| Messages              | Chat with coordinator (in-app + mirrored to WhatsApp), auto-translate option                                      | P0       |
| Stay and add-ons      | Choose room type, extra nights, interpreter hours, sightseeing, halal food etc.                                   | P1       |
| Expense tracker       | Running hospital bill vs estimate, deposits, balance due                                                          | P1       |
| Follow-up             | Teleconsult schedule, medicine reminders, recovery checklist                                                      | P1       |
| Feedback              | Rate hospital, doctor, coordinator, stay; request public review                                                   | P0       |
| Refer a friend        | Referral code and reward tracking                                                                                 | P2       |
| Emergency button      | One-tap call to 24x7 ops line with location shared                                                                | P1       |

## 6. Coordinator / operations portal

This is the core of the business: a CRM and case-management tool where case managers, medical reviewers, ground coordinators and interpreters run every patient. It must work well on mobile for ground staff.

| Feature              | Requirement                                                                                                                                  | Priority |
|----------------------|----------------------------------------------------------------------------------------------------------------------------------------------|----------|
| Lead inbox           | All leads from website, WhatsApp, calls, agents, email in one list; source and campaign captured; duplicate detection by phone/passport      | P0       |
| Auto-assignment      | Round-robin or rule-based (language, country, speciality); SLA timer visible on each lead                                                    | P0       |
| Case pipeline        | Kanban and list views by stage; filters by country, treatment, hospital, owner, agent                                                        | P0       |
| Case 360 view        | Patient profile, attendants, documents, notes, timeline of every action, messages, quotes, payments, logistics, tasks                        | P0       |
| Medical summary      | Structured form for reviewer: diagnosis, key findings, recommended specialities, urgency; attaches to hospital request                       | P0       |
| Send to hospitals    | Pick hospitals/doctors, attach summary + reports, send through hospital portal (email fallback), track responses and due time                | P0       |
| Quote builder        | Pull hospital estimates, add our package (stay, transfers, interpreter), apply currency and margin rules, generate branded PDF + portal link | P0       |
| Tasks and reminders  | Per case and per user; auto-tasks created on stage change (e.g. "book pickup" when visa approved)                                            | P0       |
| Unified messaging    | WhatsApp Business, email, SMS and in-app chat inside the case; templates in each language                                                    | P0       |
| Call logging         | Click-to-call through cloud telephony, recordings attached to case                                                                           | P1       |
| Visa tracker         | Per traveller: documents received, invitation letter, application ID, status, decision date                                                  | P0       |
| Logistics board      | Daily view of arrivals, departures, pickups, stays, interpreter bookings by city                                                             | P0       |
| Ground app           | Ground coordinators see today's jobs, mark pickup done with photo, post daily patient update, log expenses                                   | P1       |
| In-treatment updates | Daily status note sent to family; bill-vs-estimate alerts above 10% variance                                                                 | P1       |
| Incident log         | Record complaints, medical complications, lost documents; escalation to manager                                                              | P0       |
| Lost reasons         | Mandatory reason when marking lost; feeds reports                                                                                            | P0       |
| Templates            | Quote, welcome pack, visa checklist, pre-travel checklist per country and language                                                           | P0       |

## 7. Hospital and doctor partner portal

Partner hospitals' international patient desks use this portal to answer cases fast and keep us updated; doctors get a light view for opinions and teleconsults. Hospitals must find it easier than email, or they won't use it.

| Feature                   | Requirement                                                                                                                                         | Priority |
|---------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------|----------|
| Onboarding                | Hospital profile, accreditations (NABH/JCI certificate upload with expiry), departments, doctors, rooms and tariffs, bank details, signed agreement | P0       |
| Case requests inbox       | New opinion requests with case summary and reports; due-time countdown; accept/decline with reason                                                  | P0       |
| Opinion and estimate form | Treatment plan, doctor assigned, stay (hospital + outside), package price, what is included/excluded, validity date                                 | P0       |
| Package catalogue         | Fixed-price packages per procedure and room category; used by cost estimator and quote builder                                                      | P0       |
| Visa invitation           | Upload invitation letter generated on the government visa portal; mark issued                                                                       | P0       |
| Admission updates         | Admitted, surgery date, ICU/ward, expected discharge, final bill, discharge summary upload                                                          | P0       |
| Doctor view               | Doctor logs in (or uses magic link) to read case, write opinion, set teleconsult slots                                                              | P0       |
| Teleconsult               | Calendar slots, video call, consult notes saved to patient record                                                                                   | P1       |
| Referral statements       | Monthly list of patients referred, bills, referral fee due per agreement; dispute flag                                                              | P0       |
| Performance               | Response time, conversion rate, patient ratings, shown to hospital and to us                                                                        | P1       |
| Multi-branch              | Group hospitals (e.g. several branches) manage all branches from one login                                                                          | P1       |
| API option                | For large groups: push/pull cases via API instead of manual portal use                                                                              | P2       |

## 8. Agent / referral partner portal

Agents in source countries are expected to bring most early patients, so the portal must make referring simple and make commission fully transparent. Agents see only their own patients, and only the data the patient has consented to share.

| Feature               | Requirement                                                                                                      | Priority |
|-----------------------|------------------------------------------------------------------------------------------------------------------|----------|
| Agent registration    | Apply online with ID, business proof, country, languages; KYC review and approval by admin; agreement e-signed   | P0       |
| Refer a patient       | Quick form + report upload, or share a personal referral link/QR code that tags the agent automatically          | P0       |
| My referrals          | List of referred cases with stage (no medical details beyond what the patient allows)                            | P0       |
| Commission            | Commission rule shown per hospital/treatment; earned, approved, paid and pending amounts; downloadable statement | P0       |
| Payouts               | Request payout; paid by international wire or local transfer; payout history                                     | P0       |
| Marketing kit         | Brochures, price sheets, videos and social posts in local language with agent's referral link                    | P1       |
| Sub-agents            | Agency can add its own staff as sub-users                                                                        | P1       |
| Leaderboard and tiers | Silver/Gold/Platinum tiers with higher commission by volume                                                      | P2       |
| Agent training        | Short lessons on visa rules, treatments, ethics code; must accept code of conduct                                | P1       |

## 9. Admin, finance and logistics

The admin portal configures the whole system and holds the money flows; logistics masters (stays, drivers, interpreters) live here so the coordinator portal can book them.

### 9.1 Admin and content

| Feature                      | Requirement                                                                                       | Priority |
|------------------------------|---------------------------------------------------------------------------------------------------|----------|
| User and role management     | Create staff users, assign roles and cities, deactivate, force 2FA                                | P0       |
| Master data                  | Countries, languages, currencies, treatments, specialities, cities, document types, lost reasons  | P0       |
| Hospital and doctor approval | Review onboarding, verify accreditation, publish/unpublish profile                                | P0       |
| Agent approval               | KYC review, commission plan assignment, suspend                                                   | P0       |
| CMS                          | Edit treatment, hospital, doctor, city, blog pages and translations; SEO fields; publish workflow | P0       |
| Pricing rules                | Service package prices, margins, currency conversion rates (auto-updated daily)                   | P0       |
| Templates                    | Email, WhatsApp, SMS and PDF templates in every language                                          | P0       |
| Audit log                    | Who viewed or changed any patient record, with time and IP                                        | P0       |
| Reports                      | See section 15; export to Excel                                                                   | P0       |

### 9.2 Finance

| Feature                        | Requirement                                                                                            | Priority |
|--------------------------------|--------------------------------------------------------------------------------------------------------|----------|
| Invoicing                      | GST-compliant invoices for our service fees (export of services where applicable); credit notes        | P0       |
| Payment collection             | Card, international wire, UPI; payment links; partial payments; multi-currency with INR settlement     | P0       |
| Deposits on behalf of hospital | Where patient pays hospital deposit through us, track as pass-through liability, not revenue           | P1       |
| Refunds                        | Request, approve, process, with reason and refund policy check                                         | P0       |
| Hospital referral fees         | Auto-calculate from final bill and agreement %; raise invoice to hospital; track receivable and ageing | P0       |
| Agent commissions              | Auto-calculate when hospital fee is received; approval step; payout batch file; TDS where applicable   | P0       |
| Vendor payables                | Stays, drivers, interpreters, SIM vendors                                                              | P1       |
| Accounting export              | Sync to Tally / Zoho Books                                                                             | P1       |
| Profit per case                | Revenue minus cost per case, per country, per hospital, per agent                                      | P1       |

### 9.3 Logistics masters

| Feature         | Requirement                                                                                                                                               | Priority |
|-----------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|----------|
| Stays           | Partner guest houses/hotels/service apartments with distance to each hospital, room types, rates, availability calendar, halal kitchen, wheelchair access | P0       |
| Transport       | Vendors, drivers, vehicles (incl. wheelchair/ambulance), city rates; job assignment                                                                       | P0       |
| Interpreters    | Languages, city, rates, availability; assignment and hours log                                                                                            | P0       |
| Welcome kit     | SIM, currency, kit items stock per city                                                                                                                   | P2       |
| Flight bookings | Record bookings made via travel partner; PNR, times, auto-create pickup job                                                                               | P0       |

## 10. Notifications and integrations

WhatsApp is the primary channel for patients and agents in all target markets, so every key event must reach them there, with email as the record copy.

**Automatic notifications (patient, in their language)**

- Enquiry received, coordinator assigned (with name and WhatsApp link)

- Reports missing / reports received

- Opinions ready, quote sent, quote expiring in 3 days

- Payment received, invoice attached

- Invitation letter ready, visa approved / refused

- Travel itinerary confirmed, pickup driver details 24 hours and 2 hours before landing

- Appointment reminders, daily treatment update to family

- Discharge summary uploaded, follow-up teleconsult reminders, feedback request

**Internal alerts:** new lead, SLA breach, hospital response overdue, bill over estimate, arrival tomorrow, incident logged, payment failed.

**Agent alerts:** referral stage change, commission earned, payout sent.

| Integration           | Purpose                                        | Example providers (choose at build)                                       | Priority |
|-----------------------|------------------------------------------------|---------------------------------------------------------------------------|----------|
| WhatsApp Business API | Two-way chat, templates, OTP                   | Meta Cloud API via Gupshup / Interakt / WATI                              | P0       |
| Email                 | Transactional mail                             | Amazon SES / SendGrid                                                     | P0       |
| SMS                   | OTP and alerts fallback                        | MSG91 / Twilio                                                            | P0       |
| Payments              | Cards, international wires, UPI, payment links | Razorpay (international), Stripe, PayPal, bank wire with virtual accounts | P0       |
| Video                 | Teleconsults                                   | Zoom SDK / Agora / 100ms / Daily                                          | P1       |
| Cloud telephony       | Click-to-call, call recording, IVR             | Exotel / Knowlarity / Twilio                                              | P1       |
| Translation           | Auto-translate chat and documents              | Google Cloud Translation / DeepL                                          | P1       |
| Maps                  | Stay and hospital locations, distance          | Google Maps                                                               | P0       |
| Currency rates        | Daily FX for quotes                            | Open Exchange Rates / RBI reference                                       | P0       |
| e-Signature           | Hospital and agent agreements, patient consent | Leegality / Digio / DocuSign                                              | P1       |
| Accounting            | Ledger sync                                    | Tally / Zoho Books                                                        | P1       |
| Analytics and ads     | Funnels, ad conversion                         | GA4, Meta Pixel, Google Ads conversion API                                | P0       |
| Flight data           | Arrival tracking for pickups                   | AviationStack / FlightAware                                               | P2       |

## 11. Data model

**Case** is the central entity: one patient, one treatment episode; everything else hangs off it. Key entities and main fields:

| Entity          | Key fields                                                                                                        | Relations                                                                                        |
|-----------------|-------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------|
| User            | id, name, email, phone, role, language, 2FA, status                                                               | One per login; linked to Patient, Agent, HospitalStaff or Staff                                  |
| Patient         | name, DOB, gender, nationality, passport no. + expiry, address, emergency contact, consent flags                  | Has many Cases, Attendants, Documents                                                            |
| Attendant       | name, relation, passport, visa status                                                                             | Belongs to Patient; linked to Case travel                                                        |
| Case            | case no., stage, status, treatment, urgency, budget, preferred city, source, agent, owner, SLA dates, lost reason | Belongs to Patient; has Documents, Opinions, Quotes, Payments, Bookings, Tasks, Messages, Events |
| Document        | type (report, scan, passport, visa, invoice, discharge), file, uploaded by, visibility                            | Belongs to Case or Patient                                                                       |
| MedicalSummary  | diagnosis, findings, recommended speciality, reviewer, date                                                       | One per Case (versioned)                                                                         |
| Hospital        | name, city, accreditations + expiry, departments, international desk contacts, agreement %, bank                  | Has Doctors, Packages, Staff                                                                     |
| Doctor          | name, qualifications, speciality, experience, languages, consult fee                                              | Belongs to Hospital                                                                              |
| Package         | procedure, room category, price, inclusions, exclusions, stay days, validity                                      | Belongs to Hospital                                                                              |
| OpinionRequest  | case, hospital, sent at, due at, status                                                                           | Case × Hospital                                                                                  |
| Opinion         | plan, doctor, stay days, estimate, inclusions, validity                                                           | Answers OpinionRequest                                                                           |
| Quote           | line items (hospital, stay, transfers, interpreter, service fee), currency, total, status, accepted at            | Belongs to Case; references Opinion                                                              |
| Payment         | amount, currency, INR value, method, gateway ref, type (deposit, service, pass-through), status                   | Belongs to Case / Invoice                                                                        |
| Invoice         | number, GST details, lines, totals                                                                                | Belongs to Case or Hospital (referral fee)                                                       |
| VisaApplication | traveller, type, invitation letter, application ID, status, decision date                                         | Belongs to Case                                                                                  |
| Booking         | type (flight, stay, transfer, interpreter, SIM), vendor, start/end, cost, price, status                           | Belongs to Case                                                                                  |
| Agent           | company, country, KYC docs, commission plan, payout details, tier                                                 | Has many Cases (referrals)                                                                       |
| Commission      | case, agent, basis amount, %, amount, status (earned, approved, paid)                                             | Belongs to Agent and Case                                                                        |
| Task            | title, due, assignee, status                                                                                      | Belongs to Case                                                                                  |
| Message         | channel, direction, sender, body, attachments, read status                                                        | Belongs to Case                                                                                  |
| Event (audit)   | actor, action, entity, before/after, timestamp, IP                                                                | Everything                                                                                       |
| Feedback        | ratings (hospital, doctor, coordinator, stay), comment, public consent                                            | Belongs to Case                                                                                  |

## 12. Non-functional requirements, security and compliance

We hold health records and passports of foreign nationals, so privacy and security are launch requirements, not later improvements.

**Performance and reliability**

- Public pages load in under 2.5 seconds on 4G (Core Web Vitals "good"); pages server-rendered for SEO.

- Portals respond in under 1 second for 95% of actions; 99.5% uptime target; daily backups with 30-day retention and tested restore.

- Large file uploads (up to 500 MB) resumable, virus-scanned.

- Works on low-end Android phones and slow networks common in target markets.

**Security**

- HTTPS everywhere; data encrypted at rest (database and file storage).

- Role-based access; staff see only cases assigned to them or their team unless manager; agents never see medical documents.

- 2FA mandatory for staff, hospital and admin users.

- Documents served through short-lived signed links, never public URLs; watermark on downloaded reports.

- Full audit log of record views and changes; alerts on bulk downloads.

- OWASP top 10 testing and an external penetration test before launch.

**Privacy and legal (confirm with a lawyer before launch)**

- India Digital Personal Data Protection Act 2023 and its rules: explicit consent at upload, purpose limitation, data-principal rights (access, correction, erasure), grievance officer, breach reporting.

- Separate consents for sharing records with each hospital and for sharing status with agents.

- Data residency: primary storage in an Indian cloud region.

- Patients from the EU/UK: GDPR-style rights honoured.

- Clear disclaimers: we are a facilitator, not a healthcare provider; opinions come from treating doctors.

- Referral-fee disclosure to patients in terms of use; no fees from doctors personally.

- Retention policy for medical records and passports (e.g. delete passport copies 1 year after case close unless law requires longer).

**Accessibility and localisation**

- WCAG 2.1 AA for public site; RTL layout for Arabic; all templates and notifications translatable; dates, numbers and currency formatted per locale.

## 13. Recommended tech stack

A single TypeScript stack keeps the team small: one backend API serving all five portals, with separate front-end apps per portal sharing a design system. These are recommendations; the development team can propose equivalents.

| Layer                                                  | Choice                                                                 | Why                                                        |
|--------------------------------------------------------|------------------------------------------------------------------------|------------------------------------------------------------|
| Public website                                         | Next.js (server-side rendering) + headless CMS (Strapi or Payload)     | SEO, fast pages, editors update content without developers |
| Portals (patient, coordinator, hospital, agent, admin) | Next.js or React + Tailwind, shared component library                  | One codebase style; responsive for mobile staff            |
| Mobile app (phase 2)                                   | React Native / Expo for patient and ground-coordinator apps            | Reuses TypeScript logic and API                            |
| Backend API                                            | Node.js with NestJS (modular monolith), REST + webhooks                | Clear modules per domain; easy to split later              |
| Database                                               | PostgreSQL                                                             | Relational data, strong reporting, row-level security      |
| Cache and queues                                       | Redis + BullMQ                                                         | Notifications, SLA timers, scheduled jobs                  |
| File storage                                           | AWS S3 (Mumbai region) with encryption + signed URLs                   | Medical records and passports                              |
| Search                                                 | PostgreSQL full-text first; Meilisearch / OpenSearch later             | Hospital/doctor/treatment search                           |
| Auth                                                   | Own auth with JWT + refresh, OTP, 2FA; or Keycloak / Auth0             | Multi-role, multi-portal login                             |
| Hosting                                                | AWS ap-south-1 (Mumbai): ECS or Elastic Beanstalk, RDS, CloudFront CDN | India data residency, scalable                             |
| Monitoring                                             | Sentry, CloudWatch / Grafana, uptime checks                            | Catch errors fast                                          |
| CI/CD                                                  | GitHub Actions, staging + production environments                      | Safe releases                                              |

**Build vs buy note:** for a very lean start, the coordinator CRM could run on Zoho CRM or LeadSquared customised for the pipeline, with only the patient, hospital and agent portals built. Building our own is recommended if the plan is to scale beyond a few hundred cases a year.

## 14. Release plan

The MVP goes live about 4 months after kickoff with every P0 feature from sections 5 to 10; P1 features follow by month 8 and P2 by month 12.

*(Diagram in the PRD doc: release plan · 4 phases, 3 gates)*

**Suggested team for the build:** 1 product manager (can be a founder), 1 UI/UX designer, 3–4 full-stack developers, 1 QA tester, part-time DevOps. Two-week sprints with a demo to the operations team at the end of each sprint, so real coordinators shape the CRM before launch.

## 15. Success metrics

The one number that matters is **converted patients per month**; the rest explain why it moves. Targets are set after the first 3 months of real data.

| Metric                     | Definition                                                            | Where it's tracked        |
|----------------------------|-----------------------------------------------------------------------|---------------------------|
| Leads                      | New enquiries per month, by source, country, treatment                | Coordinator portal report |
| First response time        | Lead created → first contact (target under 2 hours)                   | SLA report                |
| Quote turnaround           | Reports complete → quote sent (target under 48 hours)                 | SLA report                |
| Hospital response time     | Opinion request → opinion received, per hospital                      | Hospital performance      |
| Lead-to-booking conversion | Won cases ÷ qualified leads                                           | Funnel report             |
| Visa success rate          | Visas approved ÷ applied                                              | Visa report               |
| Revenue per case           | Service fees + hospital referral fee + add-ons                        | Finance report            |
| Bill accuracy              | Final bill vs estimate (% within 10%)                                 | Case report               |
| Patient satisfaction       | Average rating and NPS at case close                                  | Feedback report           |
| Agent productivity         | Active agents, referrals and conversions per agent                    | Agent report              |
| Lost reasons               | Share of lost cases by reason                                         | Lost-case report          |
| Website                    | Organic traffic, quote-form conversion rate, cost per lead by channel | GA4 + ads                 |

## 16. Open questions and assumptions

**Assumptions made in this PRD**

- Business model: hospital referral fee (% of final bill) + patient service packages (stay, transfers, interpreter, concierge) + agent commission paid from our share.

- Patients pay hospital bills directly to the hospital; we collect only our service fees and, optionally, deposits as pass-through.

- Flights are booked via a licensed travel partner, not by us directly.

- Operations start in 2 to 3 cities with an in-house team of case managers and ground coordinators.

**Open questions**

- Brand name, domain and logo?

- Which 3 source countries and which 3–4 specialities first?

- Which cities and which hospitals are signed for launch?

- Referral fee % per hospital and agent commission % (fixed or tiered)?

- Will we collect hospital deposits from patients, or only our own fees?

- Own guest houses, or only partner stays?

- Build our own CRM or customise Zoho/LeadSquared for MVP?

- In-house developers or outsourced agency? Budget for build and first-year running cost?

- Legal review: DPDP compliance, terms, agent agreements, hospital agreements, GST treatment of export services.

- Timeline for NABH MVTF empanelment application.
