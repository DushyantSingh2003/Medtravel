-- Extensions. pg_trgm powers fuzzy search and duplicate detection, unaccent makes search ignore
-- diacritics. Both are "trusted" extensions in PostgreSQL 13+, so the database owner can create them
-- without being a superuser (a test migrates as a plain owner to prove it). If the extensions were
-- created in another schema (some managed databases use "extensions"), create them in "public" first.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Search normalisation: unaccent() is not IMMUTABLE, so it cannot be used in a trigger-built vector or an
-- index directly. This wrapper pins the dictionary and is declared immutable (the standard workaround),
-- then does what unaccent does not for Arabic: removes the short-vowel marks (tashkeel, U+064B-U+065F and
-- U+0670) and the tatweel (U+0640), and folds the alef-with-hamza forms into a plain alef, so
-- "أَحْمَد" and "احمد" find each other.
CREATE OR REPLACE FUNCTION f_unaccent(text)
  RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$
    SELECT translate(
      regexp_replace(public.unaccent('public.unaccent', $1), '[ً-ٰٟـ]', '', 'g'),
      'أإآٱ', 'اااا')
  $$;

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('patient', 'attendant', 'agent', 'case_manager', 'ground_coordinator', 'interpreter', 'medical_reviewer', 'hospital_desk', 'doctor', 'finance', 'super_admin');

-- CreateEnum
CREATE TYPE "CaseStage" AS ENUM ('enquiry', 'qualification', 'medical_review', 'hospital_opinions', 'quote_decision', 'booking_deposit', 'visa', 'travel_planning', 'arrival', 'treatment', 'discharge_return', 'follow_up', 'lost', 'on_hold', 'cancelled');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('new', 'qualifying', 'in_medical_review', 'awaiting_opinions', 'quote_sent', 'won', 'visa_in_process', 'travel_booked', 'arrived', 'in_treatment', 'discharged', 'returned_home', 'follow_up', 'closed', 'lost', 'on_hold', 'cancelled');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('invited', 'active', 'suspended', 'deactivated');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('female', 'male', 'other', 'undisclosed');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('routine', 'soon', 'urgent', 'emergency');

-- CreateEnum
CREATE TYPE "CaseSource" AS ENUM ('website', 'whatsapp', 'phone', 'email', 'agent', 'referral', 'walk_in', 'other');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('report', 'scan', 'prescription', 'passport', 'visa', 'invoice', 'bill', 'discharge', 'invitation_letter', 'photo', 'pickup_photo', 'kyc', 'agreement', 'other');

-- CreateEnum
CREATE TYPE "DocumentVisibility" AS ENUM ('private', 'internal');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('pending', 'clean', 'infected', 'failed');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('data_processing', 'share_medical_with_hospital', 'share_stage_with_agent', 'marketing', 'public_review', 'whatsapp_contact');

-- CreateEnum
CREATE TYPE "HospitalStatus" AS ENUM ('draft', 'pending_review', 'approved', 'published', 'unpublished', 'suspended');

-- CreateEnum
CREATE TYPE "AccreditationBody" AS ENUM ('nabh', 'jci', 'nabl', 'iso', 'other');

-- CreateEnum
CREATE TYPE "OpinionRequestStatus" AS ENUM ('draft', 'sent', 'viewed', 'accepted', 'declined', 'answered', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'superseded');

-- CreateEnum
CREATE TYPE "QuoteLineKind" AS ENUM ('hospital', 'stay', 'transfer', 'interpreter', 'service_fee', 'add_on', 'discount', 'other');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('deposit', 'service', 'pass_through', 'add_on', 'referral_fee');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('card', 'bank_wire', 'upi', 'payment_link', 'cash', 'other');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'authorized', 'succeeded', 'failed', 'cancelled', 'partially_refunded', 'refunded', 'chargeback');

-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('service_fee', 'referral_fee');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void');

-- CreateEnum
CREATE TYPE "CreditNoteStatus" AS ENUM ('draft', 'issued', 'void');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('requested', 'approved', 'rejected', 'processed', 'failed');

-- CreateEnum
CREATE TYPE "VisaType" AS ENUM ('medical', 'medical_attendant', 'other');

-- CreateEnum
CREATE TYPE "VisaStatus" AS ENUM ('not_started', 'documents_pending', 'invitation_requested', 'invitation_issued', 'applied', 'approved', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('flight', 'stay', 'transfer', 'interpreter', 'sim', 'other');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('requested', 'confirmed', 'en_route', 'picked_up', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "VendorKind" AS ENUM ('stay', 'transport', 'interpreter', 'sim', 'travel', 'other');

-- CreateEnum
CREATE TYPE "StayType" AS ENUM ('guest_house', 'hotel', 'service_apartment');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('sedan', 'suv', 'van', 'wheelchair', 'ambulance');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('applied', 'kyc_review', 'approved', 'suspended', 'rejected');

-- CreateEnum
CREATE TYPE "AgentTier" AS ENUM ('silver', 'gold', 'platinum');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('earned', 'approved', 'paid', 'cancelled');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('requested', 'approved', 'processing', 'paid', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('international_wire', 'local_transfer');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('open', 'in_progress', 'done', 'cancelled');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('in_app', 'whatsapp', 'email', 'sms');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "ConversationKind" AS ENUM ('patient', 'hospital', 'agent', 'internal');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('in_app', 'email', 'whatsapp', 'sms', 'push');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('complaint', 'medical_complication', 'lost_documents', 'delay', 'other');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('open', 'escalated', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "AdmissionStatus" AS ENUM ('planned', 'admitted', 'discharged', 'cancelled');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('pending', 'processing', 'processed', 'failed');

-- CreateEnum
CREATE TYPE "InterpreterEmployment" AS ENUM ('in_house', 'freelance');

-- CreateTable
CREATE TABLE "Country" (
    "code" CHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "dialCode" VARCHAR(8),
    "region" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Language" (
    "code" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,
    "rtl" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Language_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Currency" (
    "code" CHAR(3) NOT NULL,
    "name" TEXT NOT NULL,
    "minorUnits" INTEGER NOT NULL DEFAULT 2,
    "symbol" VARCHAR(8),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "FxRate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rate" DECIMAL(18,8) NOT NULL,
    "source" TEXT NOT NULL,
    "asOf" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "baseCurrency" CHAR(3) NOT NULL,
    "quoteCurrency" CHAR(3) NOT NULL,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Speciality" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Speciality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Treatment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "typicalStayDays" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "searchVector" tsvector,
    "specialityId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Treatment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "countryCode" CHAR(2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentType" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "DocumentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LostReason" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "LostReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryTranslation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "locale" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CountryTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialityTranslation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "locale" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,
    "specialityId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SpecialityTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentTranslation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "locale" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "treatmentId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TreatmentTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CityTranslation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "locale" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,
    "cityId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CityTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTypeTranslation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "locale" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,
    "documentTypeId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DocumentTypeTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LostReasonTranslation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "locale" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,
    "lostReasonId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LostReasonTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT,
    "phone" VARCHAR(20),
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "language" VARCHAR(8) NOT NULL DEFAULT 'en',
    "timezone" VARCHAR(64),
    "status" "UserStatus" NOT NULL DEFAULT 'invited',
    "passwordHash" TEXT,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" VARCHAR(45),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "lastUsedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffProfile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "isManager" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT,
    "languages" TEXT[],
    "assignable" BOOLEAN NOT NULL DEFAULT true,
    "maxOpenCases" INTEGER,
    "lastAssignedAt" TIMESTAMPTZ(3),
    "userId" UUID NOT NULL,
    "cityId" UUID,
    "managerId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentUser" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner" BOOLEAN NOT NULL DEFAULT false,
    "userId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "AgentUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fullName" TEXT NOT NULL,
    "dateOfBirth" DATE,
    "gender" "Gender",
    "passportNumber" VARCHAR(32),
    "passportExpiry" DATE,
    "phone" VARCHAR(20),
    "email" TEXT,
    "address" TEXT,
    "preferredLanguage" VARCHAR(8) NOT NULL DEFAULT 'en',
    "anonymizedAt" TIMESTAMPTZ(3),
    "emergencyContactName" TEXT,
    "emergencyContactPhone" VARCHAR(20),
    "emergencyContactRelation" TEXT,
    "searchVector" tsvector,
    "userId" UUID,
    "nationalityCode" CHAR(2),
    "countryOfResidenceCode" CHAR(2),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fullName" TEXT NOT NULL,
    "relation" TEXT,
    "email" TEXT,
    "anonymizedAt" TIMESTAMPTZ(3),
    "passportNumber" VARCHAR(32),
    "passportExpiry" DATE,
    "dateOfBirth" DATE,
    "phone" VARCHAR(20),
    "visaStatus" "VisaStatus" NOT NULL DEFAULT 'not_started',
    "patientId" UUID NOT NULL,
    "userId" UUID,
    "nationalityCode" CHAR(2),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Attendant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseAttendant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "travelNotes" TEXT,
    "caseId" UUID NOT NULL,
    "attendantId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CaseAttendant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "ConsentType" NOT NULL,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMPTZ(3),
    "ip" VARCHAR(45),
    "textVersion" VARCHAR(32),
    "patientId" UUID NOT NULL,
    "caseId" UUID,
    "hospitalId" UUID,
    "agentId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "caseNo" TEXT NOT NULL,
    "stage" "CaseStage" NOT NULL DEFAULT 'enquiry',
    "status" "CaseStatus" NOT NULL DEFAULT 'new',
    "urgency" "Urgency" NOT NULL DEFAULT 'routine',
    "budgetMinor" BIGINT,
    "source" "CaseSource" NOT NULL DEFAULT 'website',
    "campaign" TEXT,
    "preferredLanguage" VARCHAR(8),
    "stageEnteredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plannedArrivalAt" TIMESTAMPTZ(3),
    "plannedDepartureAt" TIMESTAMPTZ(3),
    "firstResponseDueAt" TIMESTAMPTZ(3),
    "firstRespondedAt" TIMESTAMPTZ(3),
    "slaDueAt" TIMESTAMPTZ(3),
    "nextActionAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "lostNote" TEXT,
    "budgetCurrency" CHAR(3),
    "patientId" UUID NOT NULL,
    "treatmentId" UUID,
    "preferredCityId" UUID,
    "countryCode" CHAR(2),
    "agentId" UUID,
    "ownerId" UUID,
    "reviewerId" UUID,
    "hospitalId" UUID,
    "lostReasonId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseStageHistory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fromStage" "CaseStage",
    "toStage" "CaseStage" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "caseId" UUID NOT NULL,
    "actorId" UUID,

    CONSTRAINT "CaseStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalSummary" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version" INTEGER NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "findings" TEXT,
    "urgency" "Urgency",
    "notes" TEXT,
    "current" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "caseId" UUID NOT NULL,
    "reviewerId" UUID,
    "recommendedSpecialityId" UUID,

    CONSTRAINT "MedicalSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "DocumentKind" NOT NULL,
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'private',
    "fileName" TEXT NOT NULL,
    "mimeType" VARCHAR(127) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" VARCHAR(64),
    "scanStatus" "ScanStatus" NOT NULL DEFAULT 'pending',
    "takenAt" DATE,
    "notes" TEXT,
    "patientId" UUID,
    "caseId" UUID,
    "agentId" UUID,
    "hospitalId" UUID,
    "typeId" UUID,
    "uploadedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentShare" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "revokedAt" TIMESTAMPTZ(3),
    "documentId" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "consentId" UUID NOT NULL,
    "sharedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "DocumentShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseIntake" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "condition" TEXT NOT NULL,
    "history" TEXT,
    "medications" TEXT,
    "caseId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CaseIntake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseNote" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "caseId" UUID NOT NULL,
    "authorId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CaseNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admission" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "status" "AdmissionStatus" NOT NULL DEFAULT 'planned',
    "admittedAt" TIMESTAMPTZ(3),
    "procedureAt" TIMESTAMPTZ(3),
    "ward" TEXT,
    "expectedDischargeAt" TIMESTAMPTZ(3),
    "dischargedAt" TIMESTAMPTZ(3),
    "fitToFlyAt" TIMESTAMPTZ(3),
    "estimateMinor" BIGINT,
    "runningBillMinor" BIGINT,
    "finalBillMinor" BIGINT,
    "notes" TEXT,
    "caseId" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "doctorId" UUID,
    "dischargeSummaryId" UUID,
    "currency" CHAR(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Admission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedWebhook" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "payload" JSONB,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hospital" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "HospitalStatus" NOT NULL DEFAULT 'draft',
    "address" TEXT,
    "website" TEXT,
    "phone" VARCHAR(20),
    "email" TEXT,
    "description" TEXT,
    "internationalDeskName" TEXT,
    "internationalDeskEmail" TEXT,
    "internationalDeskPhone" VARCHAR(20),
    "agreementBp" INTEGER,
    "bankDetails" JSONB,
    "bedCount" INTEGER,
    "establishedYear" INTEGER,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "publishedAt" TIMESTAMPTZ(3),
    "searchVector" tsvector,
    "cityId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Hospital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalBranch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "address" TEXT,
    "main" BOOLEAN NOT NULL DEFAULT false,
    "hospitalId" UUID NOT NULL,
    "cityId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "HospitalBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalStaff" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "jobTitle" TEXT,
    "userId" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "branchId" UUID,
    "doctorId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "HospitalStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Accreditation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "body" "AccreditationBody" NOT NULL,
    "certificateNo" TEXT,
    "issuedAt" DATE,
    "expiresAt" DATE,
    "hospitalId" UUID NOT NULL,
    "certificateId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Accreditation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT,
    "hospitalId" UUID NOT NULL,
    "specialityId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Doctor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT,
    "fullName" TEXT NOT NULL,
    "qualifications" TEXT,
    "experienceYears" INTEGER,
    "languages" TEXT[],
    "consultFeeMinor" BIGINT,
    "bio" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "searchVector" tsvector,
    "consultFeeCurrency" CHAR(3),
    "hospitalId" UUID NOT NULL,
    "branchId" UUID,
    "specialityId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Doctor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorTranslation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "locale" VARCHAR(8) NOT NULL,
    "fullName" TEXT NOT NULL,
    "qualifications" TEXT,
    "bio" TEXT,
    "doctorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DoctorTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalTranslation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "locale" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "hospitalId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HospitalTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "roomCategory" TEXT,
    "priceMinor" BIGINT NOT NULL,
    "stayDays" INTEGER,
    "inclusions" TEXT[],
    "exclusions" TEXT[],
    "validFrom" DATE,
    "validUntil" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "hospitalId" UUID NOT NULL,
    "treatmentId" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageTranslation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "locale" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "packageId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PackageTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpinionRequest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "status" "OpinionRequestStatus" NOT NULL DEFAULT 'draft',
    "sentAt" TIMESTAMPTZ(3),
    "dueAt" TIMESTAMPTZ(3),
    "viewedAt" TIMESTAMPTZ(3),
    "respondedAt" TIMESTAMPTZ(3),
    "declineReason" TEXT,
    "caseId" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "doctorId" UUID,
    "summaryId" UUID,
    "consentId" UUID,
    "sentById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "OpinionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opinion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version" INTEGER NOT NULL DEFAULT 1,
    "current" BOOLEAN NOT NULL DEFAULT true,
    "treatmentPlan" TEXT NOT NULL,
    "stayDaysHospital" INTEGER,
    "stayDaysOutside" INTEGER,
    "estimateMinor" BIGINT NOT NULL,
    "inclusions" TEXT[],
    "exclusions" TEXT[],
    "validUntil" DATE,
    "opinionRequestId" UUID NOT NULL,
    "doctorId" UUID,
    "packageId" UUID,
    "submittedById" UUID,
    "currency" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Opinion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quoteNo" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'draft',
    "totalMinor" BIGINT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "fxRate" DECIMAL(18,8),
    "fxRateAt" TIMESTAMPTZ(3),
    "fxSource" TEXT,
    "marginBp" INTEGER,
    "validUntil" DATE,
    "sentAt" TIMESTAMPTZ(3),
    "viewedAt" TIMESTAMPTZ(3),
    "acceptedAt" TIMESTAMPTZ(3),
    "caseId" UUID NOT NULL,
    "opinionId" UUID,
    "acceptedById" UUID,
    "createdById" UUID,
    "pdfId" UUID,
    "currency" CHAR(3) NOT NULL,
    "fxBaseCurrency" CHAR(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "QuoteLineKind" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceMinor" BIGINT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "costMinor" BIGINT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "quoteId" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoiceNo" TEXT NOT NULL,
    "supplierGstin" VARCHAR(15),
    "exportOfServices" BOOLEAN NOT NULL DEFAULT false,
    "disputedAt" TIMESTAMPTZ(3),
    "disputeNote" TEXT,
    "kind" "InvoiceKind" NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "subtotalMinor" BIGINT NOT NULL,
    "taxMinor" BIGINT NOT NULL DEFAULT 0,
    "totalMinor" BIGINT NOT NULL,
    "gstin" VARCHAR(15),
    "placeOfSupply" TEXT,
    "billToName" TEXT NOT NULL,
    "billToAddress" TEXT,
    "issuedAt" TIMESTAMPTZ(3),
    "dueAt" TIMESTAMPTZ(3),
    "paidAt" TIMESTAMPTZ(3),
    "caseId" UUID,
    "hospitalId" UUID,
    "pdfId" UUID,
    "currency" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sacCode" VARCHAR(8),
    "cgstMinor" BIGINT NOT NULL DEFAULT 0,
    "sgstMinor" BIGINT NOT NULL DEFAULT 0,
    "igstMinor" BIGINT NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceMinor" BIGINT NOT NULL,
    "taxRateBp" INTEGER NOT NULL DEFAULT 0,
    "taxMinor" BIGINT NOT NULL DEFAULT 0,
    "amountMinor" BIGINT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "invoiceId" UUID NOT NULL,
    "caseId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "creditNoteNo" TEXT NOT NULL,
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'draft',
    "reason" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "taxMinor" BIGINT NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMPTZ(3),
    "invoiceId" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "PaymentType" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "amountMinor" BIGINT NOT NULL,
    "amountInrMinor" BIGINT,
    "fxRate" DECIMAL(18,8),
    "gateway" TEXT,
    "gatewayRef" TEXT,
    "payerName" TEXT,
    "failureReason" TEXT,
    "paidAt" TIMESTAMPTZ(3),
    "caseId" UUID,
    "invoiceId" UUID,
    "quoteId" UUID,
    "currency" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "status" "RefundStatus" NOT NULL DEFAULT 'requested',
    "amountMinor" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "gatewayRef" TEXT,
    "processedAt" TIMESTAMPTZ(3),
    "paymentId" UUID NOT NULL,
    "requestedById" UUID,
    "approvedById" UUID,
    "currency" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisaApplication" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "VisaType" NOT NULL DEFAULT 'medical',
    "status" "VisaStatus" NOT NULL DEFAULT 'not_started',
    "applicationId" TEXT,
    "appliedAt" TIMESTAMPTZ(3),
    "decisionAt" TIMESTAMPTZ(3),
    "expiresAt" DATE,
    "notes" TEXT,
    "caseId" UUID NOT NULL,
    "patientId" UUID,
    "attendantId" UUID,
    "invitationLetterId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "VisaApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "VendorKind" NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" VARCHAR(20),
    "email" TEXT,
    "gstin" VARCHAR(15),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "cityId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stay" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "StayType" NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "halalKitchen" BOOLEAN NOT NULL DEFAULT false,
    "wheelchairAccessible" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "vendorId" UUID,
    "cityId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Stay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StayRoom" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "roomType" TEXT NOT NULL,
    "ratePerNightMinor" BIGINT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "stayId" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StayRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StayHospitalDistance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "distanceKm" DECIMAL(5,1) NOT NULL,
    "stayId" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StayHospitalDistance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fullName" TEXT NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "licenseNo" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "vendorId" UUID,
    "cityId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "VehicleType" NOT NULL,
    "registrationNo" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "vendorId" UUID,
    "driverId" UUID,
    "cityId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interpreter" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fullName" TEXT NOT NULL,
    "phone" VARCHAR(20),
    "employment" "InterpreterEmployment" NOT NULL DEFAULT 'in_house',
    "languages" TEXT[],
    "hourlyRateMinor" BIGINT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "hourlyRateCurrency" CHAR(3),
    "userId" UUID,
    "cityId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Interpreter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "BookingType" NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'requested',
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3),
    "costMinor" BIGINT,
    "priceMinor" BIGINT,
    "reference" TEXT,
    "details" JSONB,
    "notes" TEXT,
    "currency" CHAR(3),
    "caseId" UUID NOT NULL,
    "vendorId" UUID,
    "stayId" UUID,
    "driverId" UUID,
    "vehicleId" UUID,
    "interpreterId" UUID,
    "cityId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyName" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" VARCHAR(20),
    "email" TEXT,
    "status" "AgentStatus" NOT NULL DEFAULT 'applied',
    "tier" "AgentTier" NOT NULL DEFAULT 'silver',
    "referralCode" TEXT NOT NULL,
    "languages" TEXT[],
    "payoutDetails" JSONB,
    "approvedAt" TIMESTAMPTZ(3),
    "countryCode" CHAR(2) NOT NULL,
    "commissionPlanId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPlan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "defaultRateBp" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CommissionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rateBp" INTEGER NOT NULL,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "planId" UUID NOT NULL,
    "hospitalId" UUID,
    "treatmentId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commission" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "basisMinor" BIGINT NOT NULL,
    "rateBp" INTEGER NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "tdsMinor" BIGINT NOT NULL DEFAULT 0,
    "status" "CommissionStatus" NOT NULL DEFAULT 'earned',
    "earnedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMPTZ(3),
    "caseId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "payoutId" UUID,
    "currency" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "method" "PayoutMethod" NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'requested',
    "amountMinor" BIGINT NOT NULL,
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMPTZ(3),
    "reference" TEXT,
    "batchRef" TEXT,
    "agentId" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMPTZ(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'open',
    "priority" "TaskPriority" NOT NULL DEFAULT 'normal',
    "autoKey" TEXT,
    "completedAt" TIMESTAMPTZ(3),
    "caseId" UUID,
    "assigneeId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "ConversationKind" NOT NULL,
    "subject" TEXT,
    "lastMessageAt" TIMESTAMPTZ(3),
    "caseId" UUID,
    "hospitalId" UUID,
    "agentId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channel" "MessageChannel" NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "senderLabel" TEXT,
    "body" TEXT NOT NULL,
    "bodyTranslated" TEXT,
    "language" VARCHAR(8),
    "externalId" TEXT,
    "deliveredAt" TIMESTAMPTZ(3),
    "readAt" TIMESTAMPTZ(3),
    "conversationId" UUID NOT NULL,
    "senderId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageAttachment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "messageId" UUID NOT NULL,
    "documentId" UUID NOT NULL,

    CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'queued',
    "templateKey" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "data" JSONB,
    "sentAt" TIMESTAMPTZ(3),
    "readAt" TIMESTAMPTZ(3),
    "userId" UUID NOT NULL,
    "caseId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "hospitalRating" INTEGER,
    "doctorRating" INTEGER,
    "coordinatorRating" INTEGER,
    "stayRating" INTEGER,
    "comment" TEXT,
    "publicConsent" BOOLEAN NOT NULL DEFAULT false,
    "caseId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "hospitalId" UUID,
    "doctorId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "IncidentType" NOT NULL,
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'medium',
    "status" "IncidentStatus" NOT NULL DEFAULT 'open',
    "description" TEXT NOT NULL,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMPTZ(3),
    "caseId" UUID,
    "reportedById" UUID,
    "assigneeId" UUID,
    "escalatedToId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actorId" UUID,
    "actorRole" VARCHAR(32),
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "patientId" UUID,
    "before" JSONB,
    "after" JSONB,
    "ip" VARCHAR(45),
    "userAgent" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dedupeKey" TEXT,
    "type" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NumberSequence" (
    "key" TEXT NOT NULL,
    "period" VARCHAR(16) NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "NumberSequence_pkey" PRIMARY KEY ("key","period")
);

-- CreateIndex
CREATE UNIQUE INDEX "FxRate_baseCurrency_quoteCurrency_asOf_key" ON "FxRate"("baseCurrency", "quoteCurrency", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "Speciality_slug_key" ON "Speciality"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Treatment_slug_key" ON "Treatment"("slug");

-- CreateIndex
CREATE INDEX "Treatment_searchVector_idx" ON "Treatment" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "Treatment_specialityId_idx" ON "Treatment"("specialityId");

-- CreateIndex
CREATE UNIQUE INDEX "City_slug_key" ON "City"("slug");

-- CreateIndex
CREATE INDEX "City_countryCode_idx" ON "City"("countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentType_code_key" ON "DocumentType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "LostReason_code_key" ON "LostReason"("code");

-- CreateIndex
CREATE INDEX "CountryTranslation_locale_idx" ON "CountryTranslation"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "CountryTranslation_countryCode_locale_key" ON "CountryTranslation"("countryCode", "locale");

-- CreateIndex
CREATE INDEX "SpecialityTranslation_locale_idx" ON "SpecialityTranslation"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "SpecialityTranslation_specialityId_locale_key" ON "SpecialityTranslation"("specialityId", "locale");

-- CreateIndex
CREATE INDEX "TreatmentTranslation_locale_idx" ON "TreatmentTranslation"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentTranslation_treatmentId_locale_key" ON "TreatmentTranslation"("treatmentId", "locale");

-- CreateIndex
CREATE INDEX "CityTranslation_locale_idx" ON "CityTranslation"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "CityTranslation_cityId_locale_key" ON "CityTranslation"("cityId", "locale");

-- CreateIndex
CREATE INDEX "DocumentTypeTranslation_locale_idx" ON "DocumentTypeTranslation"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTypeTranslation_documentTypeId_locale_key" ON "DocumentTypeTranslation"("documentTypeId", "locale");

-- CreateIndex
CREATE INDEX "LostReasonTranslation_locale_idx" ON "LostReasonTranslation"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "LostReasonTranslation_lostReasonId_locale_key" ON "LostReasonTranslation"("lostReasonId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_userId_key" ON "StaffProfile"("userId");

-- CreateIndex
CREATE INDEX "StaffProfile_cityId_idx" ON "StaffProfile"("cityId");

-- CreateIndex
CREATE INDEX "StaffProfile_managerId_idx" ON "StaffProfile"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentUser_userId_key" ON "AgentUser"("userId");

-- CreateIndex
CREATE INDEX "AgentUser_agentId_idx" ON "AgentUser"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_userId_key" ON "Patient"("userId");

-- CreateIndex
CREATE INDEX "Patient_phone_idx" ON "Patient"("phone");

-- CreateIndex
CREATE INDEX "Patient_passportExpiry_idx" ON "Patient"("passportExpiry");

-- CreateIndex
CREATE INDEX "Patient_passportNumber_idx" ON "Patient"("passportNumber");

-- CreateIndex
CREATE INDEX "Patient_email_idx" ON "Patient"("email");

-- CreateIndex
CREATE INDEX "Patient_createdAt_idx" ON "Patient"("createdAt");

-- CreateIndex
CREATE INDEX "Patient_searchVector_idx" ON "Patient" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "Patient_nationalityCode_idx" ON "Patient"("nationalityCode");

-- CreateIndex
CREATE INDEX "Patient_countryOfResidenceCode_idx" ON "Patient"("countryOfResidenceCode");

-- CreateIndex
CREATE UNIQUE INDEX "Attendant_userId_key" ON "Attendant"("userId");

-- CreateIndex
CREATE INDEX "Attendant_patientId_idx" ON "Attendant"("patientId");

-- CreateIndex
CREATE INDEX "Attendant_nationalityCode_idx" ON "Attendant"("nationalityCode");

-- CreateIndex
CREATE INDEX "CaseAttendant_attendantId_idx" ON "CaseAttendant"("attendantId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseAttendant_caseId_attendantId_key" ON "CaseAttendant"("caseId", "attendantId");

-- CreateIndex
CREATE INDEX "Consent_patientId_type_idx" ON "Consent"("patientId", "type");

-- CreateIndex
CREATE INDEX "Consent_caseId_idx" ON "Consent"("caseId");

-- CreateIndex
CREATE INDEX "Consent_hospitalId_idx" ON "Consent"("hospitalId");

-- CreateIndex
CREATE INDEX "Consent_agentId_idx" ON "Consent"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "Case_caseNo_key" ON "Case"("caseNo");

-- CreateIndex
CREATE INDEX "Case_status_idx" ON "Case"("status");

-- CreateIndex
CREATE INDEX "Case_createdAt_idx" ON "Case"("createdAt");

-- CreateIndex
CREATE INDEX "Case_slaDueAt_idx" ON "Case"("slaDueAt");

-- CreateIndex
CREATE INDEX "Case_stage_ownerId_idx" ON "Case"("stage", "ownerId");

-- CreateIndex
CREATE INDEX "Case_stage_createdAt_idx" ON "Case"("stage", "createdAt");

-- CreateIndex
CREATE INDEX "Case_closedAt_idx" ON "Case"("closedAt");

-- CreateIndex
CREATE INDEX "Case_patientId_idx" ON "Case"("patientId");

-- CreateIndex
CREATE INDEX "Case_treatmentId_idx" ON "Case"("treatmentId");

-- CreateIndex
CREATE INDEX "Case_preferredCityId_idx" ON "Case"("preferredCityId");

-- CreateIndex
CREATE INDEX "Case_countryCode_idx" ON "Case"("countryCode");

-- CreateIndex
CREATE INDEX "Case_agentId_idx" ON "Case"("agentId");

-- CreateIndex
CREATE INDEX "Case_ownerId_idx" ON "Case"("ownerId");

-- CreateIndex
CREATE INDEX "Case_reviewerId_idx" ON "Case"("reviewerId");

-- CreateIndex
CREATE INDEX "Case_hospitalId_idx" ON "Case"("hospitalId");

-- CreateIndex
CREATE INDEX "Case_lostReasonId_idx" ON "Case"("lostReasonId");

-- CreateIndex
CREATE INDEX "CaseStageHistory_caseId_createdAt_idx" ON "CaseStageHistory"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "CaseStageHistory_actorId_idx" ON "CaseStageHistory"("actorId");

-- CreateIndex
CREATE INDEX "MedicalSummary_reviewerId_idx" ON "MedicalSummary"("reviewerId");

-- CreateIndex
CREATE INDEX "MedicalSummary_recommendedSpecialityId_idx" ON "MedicalSummary"("recommendedSpecialityId");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalSummary_caseId_version_key" ON "MedicalSummary"("caseId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");

-- CreateIndex
CREATE INDEX "Document_kind_idx" ON "Document"("kind");

-- CreateIndex
CREATE INDEX "Document_caseId_kind_idx" ON "Document"("caseId", "kind");

-- CreateIndex
CREATE INDEX "Document_patientId_idx" ON "Document"("patientId");

-- CreateIndex
CREATE INDEX "Document_agentId_idx" ON "Document"("agentId");

-- CreateIndex
CREATE INDEX "Document_hospitalId_idx" ON "Document"("hospitalId");

-- CreateIndex
CREATE INDEX "Document_typeId_idx" ON "Document"("typeId");

-- CreateIndex
CREATE INDEX "Document_uploadedById_idx" ON "Document"("uploadedById");

-- CreateIndex
CREATE INDEX "DocumentShare_hospitalId_idx" ON "DocumentShare"("hospitalId");

-- CreateIndex
CREATE INDEX "DocumentShare_consentId_idx" ON "DocumentShare"("consentId");

-- CreateIndex
CREATE INDEX "DocumentShare_sharedById_idx" ON "DocumentShare"("sharedById");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentShare_documentId_hospitalId_key" ON "DocumentShare"("documentId", "hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseIntake_caseId_key" ON "CaseIntake"("caseId");

-- CreateIndex
CREATE INDEX "CaseNote_caseId_createdAt_idx" ON "CaseNote"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "CaseNote_authorId_idx" ON "CaseNote"("authorId");

-- CreateIndex
CREATE INDEX "Admission_status_idx" ON "Admission"("status");

-- CreateIndex
CREATE INDEX "Admission_admittedAt_idx" ON "Admission"("admittedAt");

-- CreateIndex
CREATE INDEX "Admission_expectedDischargeAt_idx" ON "Admission"("expectedDischargeAt");

-- CreateIndex
CREATE INDEX "Admission_hospitalId_idx" ON "Admission"("hospitalId");

-- CreateIndex
CREATE INDEX "Admission_doctorId_idx" ON "Admission"("doctorId");

-- CreateIndex
CREATE INDEX "Admission_dischargeSummaryId_idx" ON "Admission"("dischargeSummaryId");

-- CreateIndex
CREATE UNIQUE INDEX "Admission_caseId_hospitalId_key" ON "Admission"("caseId", "hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedWebhook_provider_eventId_key" ON "ProcessedWebhook"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Hospital_slug_key" ON "Hospital"("slug");

-- CreateIndex
CREATE INDEX "Hospital_status_idx" ON "Hospital"("status");

-- CreateIndex
CREATE INDEX "Hospital_searchVector_idx" ON "Hospital" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "Hospital_cityId_idx" ON "Hospital"("cityId");

-- CreateIndex
CREATE INDEX "HospitalBranch_hospitalId_idx" ON "HospitalBranch"("hospitalId");

-- CreateIndex
CREATE INDEX "HospitalBranch_cityId_idx" ON "HospitalBranch"("cityId");

-- CreateIndex
CREATE INDEX "HospitalStaff_hospitalId_idx" ON "HospitalStaff"("hospitalId");

-- CreateIndex
CREATE INDEX "HospitalStaff_branchId_idx" ON "HospitalStaff"("branchId");

-- CreateIndex
CREATE INDEX "HospitalStaff_doctorId_idx" ON "HospitalStaff"("doctorId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalStaff_userId_hospitalId_key" ON "HospitalStaff"("userId", "hospitalId");

-- CreateIndex
CREATE INDEX "Accreditation_expiresAt_idx" ON "Accreditation"("expiresAt");

-- CreateIndex
CREATE INDEX "Accreditation_hospitalId_idx" ON "Accreditation"("hospitalId");

-- CreateIndex
CREATE INDEX "Accreditation_certificateId_idx" ON "Accreditation"("certificateId");

-- CreateIndex
CREATE INDEX "Department_specialityId_idx" ON "Department"("specialityId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_hospitalId_specialityId_key" ON "Department"("hospitalId", "specialityId");

-- CreateIndex
CREATE UNIQUE INDEX "Doctor_slug_key" ON "Doctor"("slug");

-- CreateIndex
CREATE INDEX "Doctor_searchVector_idx" ON "Doctor" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "Doctor_hospitalId_idx" ON "Doctor"("hospitalId");

-- CreateIndex
CREATE INDEX "Doctor_branchId_idx" ON "Doctor"("branchId");

-- CreateIndex
CREATE INDEX "Doctor_specialityId_idx" ON "Doctor"("specialityId");

-- CreateIndex
CREATE INDEX "DoctorTranslation_locale_idx" ON "DoctorTranslation"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorTranslation_doctorId_locale_key" ON "DoctorTranslation"("doctorId", "locale");

-- CreateIndex
CREATE INDEX "HospitalTranslation_locale_idx" ON "HospitalTranslation"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalTranslation_hospitalId_locale_key" ON "HospitalTranslation"("hospitalId", "locale");

-- CreateIndex
CREATE INDEX "Package_hospitalId_treatmentId_idx" ON "Package"("hospitalId", "treatmentId");

-- CreateIndex
CREATE INDEX "Package_treatmentId_idx" ON "Package"("treatmentId");

-- CreateIndex
CREATE INDEX "PackageTranslation_locale_idx" ON "PackageTranslation"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "PackageTranslation_packageId_locale_key" ON "PackageTranslation"("packageId", "locale");

-- CreateIndex
CREATE INDEX "OpinionRequest_caseId_hospitalId_idx" ON "OpinionRequest"("caseId", "hospitalId");

-- CreateIndex
CREATE INDEX "OpinionRequest_hospitalId_status_idx" ON "OpinionRequest"("hospitalId", "status");

-- CreateIndex
CREATE INDEX "OpinionRequest_dueAt_idx" ON "OpinionRequest"("dueAt");

-- CreateIndex
CREATE INDEX "OpinionRequest_doctorId_idx" ON "OpinionRequest"("doctorId");

-- CreateIndex
CREATE INDEX "OpinionRequest_summaryId_idx" ON "OpinionRequest"("summaryId");

-- CreateIndex
CREATE INDEX "OpinionRequest_consentId_idx" ON "OpinionRequest"("consentId");

-- CreateIndex
CREATE INDEX "OpinionRequest_sentById_idx" ON "OpinionRequest"("sentById");

-- CreateIndex
CREATE INDEX "Opinion_doctorId_idx" ON "Opinion"("doctorId");

-- CreateIndex
CREATE INDEX "Opinion_packageId_idx" ON "Opinion"("packageId");

-- CreateIndex
CREATE INDEX "Opinion_submittedById_idx" ON "Opinion"("submittedById");

-- CreateIndex
CREATE UNIQUE INDEX "Opinion_opinionRequestId_version_key" ON "Opinion"("opinionRequestId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_quoteNo_key" ON "Quote"("quoteNo");

-- CreateIndex
CREATE INDEX "Quote_status_idx" ON "Quote"("status");

-- CreateIndex
CREATE INDEX "Quote_validUntil_idx" ON "Quote"("validUntil");

-- CreateIndex
CREATE INDEX "Quote_opinionId_idx" ON "Quote"("opinionId");

-- CreateIndex
CREATE INDEX "Quote_acceptedById_idx" ON "Quote"("acceptedById");

-- CreateIndex
CREATE INDEX "Quote_createdById_idx" ON "Quote"("createdById");

-- CreateIndex
CREATE INDEX "Quote_pdfId_idx" ON "Quote"("pdfId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_caseId_version_key" ON "Quote"("caseId", "version");

-- CreateIndex
CREATE INDEX "QuoteLine_quoteId_idx" ON "QuoteLine"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNo_key" ON "Invoice"("invoiceNo");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_issuedAt_idx" ON "Invoice"("issuedAt");

-- CreateIndex
CREATE INDEX "Invoice_status_dueAt_idx" ON "Invoice"("status", "dueAt");

-- CreateIndex
CREATE INDEX "Invoice_caseId_idx" ON "Invoice"("caseId");

-- CreateIndex
CREATE INDEX "Invoice_hospitalId_idx" ON "Invoice"("hospitalId");

-- CreateIndex
CREATE INDEX "Invoice_pdfId_idx" ON "Invoice"("pdfId");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceLine_caseId_idx" ON "InvoiceLine"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_creditNoteNo_key" ON "CreditNote"("creditNoteNo");

-- CreateIndex
CREATE INDEX "CreditNote_invoiceId_idx" ON "CreditNote"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_paidAt_idx" ON "Payment"("paidAt");

-- CreateIndex
CREATE INDEX "Payment_type_status_idx" ON "Payment"("type", "status");

-- CreateIndex
CREATE INDEX "Payment_caseId_idx" ON "Payment"("caseId");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_quoteId_idx" ON "Payment"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_gateway_gatewayRef_key" ON "Payment"("gateway", "gatewayRef");

-- CreateIndex
CREATE INDEX "Refund_status_idx" ON "Refund"("status");

-- CreateIndex
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");

-- CreateIndex
CREATE INDEX "Refund_requestedById_idx" ON "Refund"("requestedById");

-- CreateIndex
CREATE INDEX "Refund_approvedById_idx" ON "Refund"("approvedById");

-- CreateIndex
CREATE INDEX "VisaApplication_status_idx" ON "VisaApplication"("status");

-- CreateIndex
CREATE INDEX "VisaApplication_expiresAt_idx" ON "VisaApplication"("expiresAt");

-- CreateIndex
CREATE INDEX "VisaApplication_caseId_idx" ON "VisaApplication"("caseId");

-- CreateIndex
CREATE INDEX "VisaApplication_patientId_idx" ON "VisaApplication"("patientId");

-- CreateIndex
CREATE INDEX "VisaApplication_attendantId_idx" ON "VisaApplication"("attendantId");

-- CreateIndex
CREATE INDEX "VisaApplication_invitationLetterId_idx" ON "VisaApplication"("invitationLetterId");

-- CreateIndex
CREATE INDEX "Vendor_kind_idx" ON "Vendor"("kind");

-- CreateIndex
CREATE INDEX "Vendor_cityId_idx" ON "Vendor"("cityId");

-- CreateIndex
CREATE INDEX "Stay_vendorId_idx" ON "Stay"("vendorId");

-- CreateIndex
CREATE INDEX "Stay_cityId_idx" ON "Stay"("cityId");

-- CreateIndex
CREATE INDEX "StayRoom_stayId_idx" ON "StayRoom"("stayId");

-- CreateIndex
CREATE INDEX "StayHospitalDistance_hospitalId_idx" ON "StayHospitalDistance"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "StayHospitalDistance_stayId_hospitalId_key" ON "StayHospitalDistance"("stayId", "hospitalId");

-- CreateIndex
CREATE INDEX "Driver_vendorId_idx" ON "Driver"("vendorId");

-- CreateIndex
CREATE INDEX "Driver_cityId_idx" ON "Driver"("cityId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_registrationNo_key" ON "Vehicle"("registrationNo");

-- CreateIndex
CREATE INDEX "Vehicle_vendorId_idx" ON "Vehicle"("vendorId");

-- CreateIndex
CREATE INDEX "Vehicle_driverId_idx" ON "Vehicle"("driverId");

-- CreateIndex
CREATE INDEX "Vehicle_cityId_idx" ON "Vehicle"("cityId");

-- CreateIndex
CREATE UNIQUE INDEX "Interpreter_userId_key" ON "Interpreter"("userId");

-- CreateIndex
CREATE INDEX "Interpreter_cityId_idx" ON "Interpreter"("cityId");

-- CreateIndex
CREATE INDEX "Booking_type_startsAt_idx" ON "Booking"("type", "startsAt");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE INDEX "Booking_startsAt_idx" ON "Booking"("startsAt");

-- CreateIndex
CREATE INDEX "Booking_cityId_startsAt_idx" ON "Booking"("cityId", "startsAt");

-- CreateIndex
CREATE INDEX "Booking_caseId_idx" ON "Booking"("caseId");

-- CreateIndex
CREATE INDEX "Booking_vendorId_idx" ON "Booking"("vendorId");

-- CreateIndex
CREATE INDEX "Booking_stayId_idx" ON "Booking"("stayId");

-- CreateIndex
CREATE INDEX "Booking_driverId_idx" ON "Booking"("driverId");

-- CreateIndex
CREATE INDEX "Booking_vehicleId_idx" ON "Booking"("vehicleId");

-- CreateIndex
CREATE INDEX "Booking_interpreterId_idx" ON "Booking"("interpreterId");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_referralCode_key" ON "Agent"("referralCode");

-- CreateIndex
CREATE INDEX "Agent_status_idx" ON "Agent"("status");

-- CreateIndex
CREATE INDEX "Agent_countryCode_idx" ON "Agent"("countryCode");

-- CreateIndex
CREATE INDEX "Agent_commissionPlanId_idx" ON "Agent"("commissionPlanId");

-- CreateIndex
CREATE INDEX "CommissionRule_planId_idx" ON "CommissionRule"("planId");

-- CreateIndex
CREATE INDEX "CommissionRule_hospitalId_idx" ON "CommissionRule"("hospitalId");

-- CreateIndex
CREATE INDEX "CommissionRule_treatmentId_idx" ON "CommissionRule"("treatmentId");

-- CreateIndex
CREATE INDEX "Commission_caseId_agentId_idx" ON "Commission"("caseId", "agentId");

-- CreateIndex
CREATE INDEX "Commission_status_idx" ON "Commission"("status");

-- CreateIndex
CREATE INDEX "Commission_agentId_idx" ON "Commission"("agentId");

-- CreateIndex
CREATE INDEX "Commission_payoutId_idx" ON "Commission"("payoutId");

-- CreateIndex
CREATE INDEX "Payout_status_idx" ON "Payout"("status");

-- CreateIndex
CREATE INDEX "Payout_agentId_idx" ON "Payout"("agentId");

-- CreateIndex
CREATE INDEX "Task_assigneeId_status_dueAt_idx" ON "Task"("assigneeId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_dueAt_idx" ON "Task"("dueAt");

-- CreateIndex
CREATE INDEX "Task_caseId_idx" ON "Task"("caseId");

-- CreateIndex
CREATE INDEX "Task_createdById_idx" ON "Task"("createdById");

-- CreateIndex
CREATE INDEX "Conversation_caseId_lastMessageAt_idx" ON "Conversation"("caseId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_hospitalId_idx" ON "Conversation"("hospitalId");

-- CreateIndex
CREATE INDEX "Conversation_agentId_idx" ON "Conversation"("agentId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");

-- CreateIndex
CREATE INDEX "MessageAttachment_documentId_idx" ON "MessageAttachment"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageAttachment_messageId_documentId_key" ON "MessageAttachment"("messageId", "documentId");

-- CreateIndex
CREATE INDEX "Notification_userId_status_idx" ON "Notification"("userId", "status");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_caseId_idx" ON "Notification"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_caseId_key" ON "Feedback"("caseId");

-- CreateIndex
CREATE INDEX "Feedback_patientId_idx" ON "Feedback"("patientId");

-- CreateIndex
CREATE INDEX "Feedback_hospitalId_idx" ON "Feedback"("hospitalId");

-- CreateIndex
CREATE INDEX "Feedback_doctorId_idx" ON "Feedback"("doctorId");

-- CreateIndex
CREATE INDEX "Incident_status_severity_idx" ON "Incident"("status", "severity");

-- CreateIndex
CREATE INDEX "Incident_caseId_idx" ON "Incident"("caseId");

-- CreateIndex
CREATE INDEX "Incident_reportedById_idx" ON "Incident"("reportedById");

-- CreateIndex
CREATE INDEX "Incident_assigneeId_idx" ON "Incident"("assigneeId");

-- CreateIndex
CREATE INDEX "Incident_escalatedToId_idx" ON "Incident"("escalatedToId");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_patientId_createdAt_idx" ON "AuditEvent"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_dedupeKey_key" ON "OutboxEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_availableAt_idx" ON "OutboxEvent"("status", "availableAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_processedAt_idx" ON "OutboxEvent"("processedAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_aggregateType_aggregateId_idx" ON "OutboxEvent"("aggregateType", "aggregateId");

-- AddForeignKey
ALTER TABLE "FxRate" ADD CONSTRAINT "FxRate_baseCurrency_fkey" FOREIGN KEY ("baseCurrency") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FxRate" ADD CONSTRAINT "FxRate_quoteCurrency_fkey" FOREIGN KEY ("quoteCurrency") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Treatment" ADD CONSTRAINT "Treatment_specialityId_fkey" FOREIGN KEY ("specialityId") REFERENCES "Speciality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "City" ADD CONSTRAINT "City_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountryTranslation" ADD CONSTRAINT "CountryTranslation_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialityTranslation" ADD CONSTRAINT "SpecialityTranslation_specialityId_fkey" FOREIGN KEY ("specialityId") REFERENCES "Speciality"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentTranslation" ADD CONSTRAINT "TreatmentTranslation_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "Treatment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CityTranslation" ADD CONSTRAINT "CityTranslation_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTypeTranslation" ADD CONSTRAINT "DocumentTypeTranslation_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LostReasonTranslation" ADD CONSTRAINT "LostReasonTranslation_lostReasonId_fkey" FOREIGN KEY ("lostReasonId") REFERENCES "LostReason"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentUser" ADD CONSTRAINT "AgentUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentUser" ADD CONSTRAINT "AgentUser_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_nationalityCode_fkey" FOREIGN KEY ("nationalityCode") REFERENCES "Country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_countryOfResidenceCode_fkey" FOREIGN KEY ("countryOfResidenceCode") REFERENCES "Country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendant" ADD CONSTRAINT "Attendant_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendant" ADD CONSTRAINT "Attendant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendant" ADD CONSTRAINT "Attendant_nationalityCode_fkey" FOREIGN KEY ("nationalityCode") REFERENCES "Country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAttendant" ADD CONSTRAINT "CaseAttendant_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAttendant" ADD CONSTRAINT "CaseAttendant_attendantId_fkey" FOREIGN KEY ("attendantId") REFERENCES "Attendant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_budgetCurrency_fkey" FOREIGN KEY ("budgetCurrency") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "Treatment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_preferredCityId_fkey" FOREIGN KEY ("preferredCityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_lostReasonId_fkey" FOREIGN KEY ("lostReasonId") REFERENCES "LostReason"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStageHistory" ADD CONSTRAINT "CaseStageHistory_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStageHistory" ADD CONSTRAINT "CaseStageHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalSummary" ADD CONSTRAINT "MedicalSummary_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalSummary" ADD CONSTRAINT "MedicalSummary_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalSummary" ADD CONSTRAINT "MedicalSummary_recommendedSpecialityId_fkey" FOREIGN KEY ("recommendedSpecialityId") REFERENCES "Speciality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "DocumentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentShare" ADD CONSTRAINT "DocumentShare_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentShare" ADD CONSTRAINT "DocumentShare_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentShare" ADD CONSTRAINT "DocumentShare_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "Consent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentShare" ADD CONSTRAINT "DocumentShare_sharedById_fkey" FOREIGN KEY ("sharedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseIntake" ADD CONSTRAINT "CaseIntake_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseNote" ADD CONSTRAINT "CaseNote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseNote" ADD CONSTRAINT "CaseNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_dischargeSummaryId_fkey" FOREIGN KEY ("dischargeSummaryId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_currency_fkey" FOREIGN KEY ("currency") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hospital" ADD CONSTRAINT "Hospital_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalBranch" ADD CONSTRAINT "HospitalBranch_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalBranch" ADD CONSTRAINT "HospitalBranch_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalStaff" ADD CONSTRAINT "HospitalStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalStaff" ADD CONSTRAINT "HospitalStaff_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalStaff" ADD CONSTRAINT "HospitalStaff_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "HospitalBranch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalStaff" ADD CONSTRAINT "HospitalStaff_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accreditation" ADD CONSTRAINT "Accreditation_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accreditation" ADD CONSTRAINT "Accreditation_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_specialityId_fkey" FOREIGN KEY ("specialityId") REFERENCES "Speciality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Doctor" ADD CONSTRAINT "Doctor_consultFeeCurrency_fkey" FOREIGN KEY ("consultFeeCurrency") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Doctor" ADD CONSTRAINT "Doctor_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Doctor" ADD CONSTRAINT "Doctor_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "HospitalBranch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Doctor" ADD CONSTRAINT "Doctor_specialityId_fkey" FOREIGN KEY ("specialityId") REFERENCES "Speciality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorTranslation" ADD CONSTRAINT "DoctorTranslation_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalTranslation" ADD CONSTRAINT "HospitalTranslation_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "Treatment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_currency_fkey" FOREIGN KEY ("currency") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageTranslation" ADD CONSTRAINT "PackageTranslation_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpinionRequest" ADD CONSTRAINT "OpinionRequest_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpinionRequest" ADD CONSTRAINT "OpinionRequest_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpinionRequest" ADD CONSTRAINT "OpinionRequest_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpinionRequest" ADD CONSTRAINT "OpinionRequest_summaryId_fkey" FOREIGN KEY ("summaryId") REFERENCES "MedicalSummary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpinionRequest" ADD CONSTRAINT "OpinionRequest_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "Consent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpinionRequest" ADD CONSTRAINT "OpinionRequest_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opinion" ADD CONSTRAINT "Opinion_opinionRequestId_fkey" FOREIGN KEY ("opinionRequestId") REFERENCES "OpinionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opinion" ADD CONSTRAINT "Opinion_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opinion" ADD CONSTRAINT "Opinion_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opinion" ADD CONSTRAINT "Opinion_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opinion" ADD CONSTRAINT "Opinion_currency_fkey" FOREIGN KEY ("currency") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_opinionId_fkey" FOREIGN KEY ("opinionId") REFERENCES "Opinion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_pdfId_fkey" FOREIGN KEY ("pdfId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_currency_fkey" FOREIGN KEY ("currency") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_fxBaseCurrency_fkey" FOREIGN KEY ("fxBaseCurrency") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_currency_fkey" FOREIGN KEY ("currency") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_pdfId_fkey" FOREIGN KEY ("pdfId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_currency_fkey" FOREIGN KEY ("currency") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_currency_fkey" FOREIGN KEY ("currency") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_currency_fkey" FOREIGN KEY ("currency") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_currency_fkey" FOREIGN KEY ("currency") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisaApplication" ADD CONSTRAINT "VisaApplication_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisaApplication" ADD CONSTRAINT "VisaApplication_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisaApplication" ADD CONSTRAINT "VisaApplication_attendantId_fkey" FOREIGN KEY ("attendantId") REFERENCES "Attendant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisaApplication" ADD CONSTRAINT "VisaApplication_invitationLetterId_fkey" FOREIGN KEY ("invitationLetterId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stay" ADD CONSTRAINT "Stay_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stay" ADD CONSTRAINT "Stay_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StayRoom" ADD CONSTRAINT "StayRoom_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "Stay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StayRoom" ADD CONSTRAINT "StayRoom_currency_fkey" FOREIGN KEY ("currency") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StayHospitalDistance" ADD CONSTRAINT "StayHospitalDistance_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "Stay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StayHospitalDistance" ADD CONSTRAINT "StayHospitalDistance_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interpreter" ADD CONSTRAINT "Interpreter_hourlyRateCurrency_fkey" FOREIGN KEY ("hourlyRateCurrency") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interpreter" ADD CONSTRAINT "Interpreter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interpreter" ADD CONSTRAINT "Interpreter_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_currency_fkey" FOREIGN KEY ("currency") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "Stay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_interpreterId_fkey" FOREIGN KEY ("interpreterId") REFERENCES "Interpreter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_commissionPlanId_fkey" FOREIGN KEY ("commissionPlanId") REFERENCES "CommissionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CommissionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "Treatment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_currency_fkey" FOREIGN KEY ("currency") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_currency_fkey" FOREIGN KEY ("currency") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_escalatedToId_fkey" FOREIGN KEY ("escalatedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------------
-- Rules Prisma cannot express: value checks, partial unique indexes, consent binding, append-only audit.
-- ---------------------------------------------------------------------------------------------------

-- Emails are stored lower-case, so the unique index is effectively case-insensitive.
ALTER TABLE "User" ADD CONSTRAINT "User_email_lowercase_check" CHECK ("email" IS NULL OR "email" = lower("email"));
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_email_lowercase_check" CHECK ("email" IS NULL OR "email" = lower("email"));
ALTER TABLE "Attendant" ADD CONSTRAINT "Attendant_email_lowercase_check" CHECK ("email" IS NULL OR "email" = lower("email"));
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_email_lowercase_check" CHECK ("email" IS NULL OR "email" = lower("email"));
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_email_lowercase_check" CHECK ("email" IS NULL OR "email" = lower("email"));
ALTER TABLE "Hospital" ADD CONSTRAINT "Hospital_email_lowercase_check" CHECK (
  ("email" IS NULL OR "email" = lower("email")) AND ("internationalDeskEmail" IS NULL OR "internationalDeskEmail" = lower("internationalDeskEmail")));

-- Money is never negative and a payment, refund or payout is never zero.
ALTER TABLE "Case" ADD CONSTRAINT "Case_budget_check" CHECK ("budgetMinor" IS NULL OR "budgetMinor" >= 0);
ALTER TABLE "Package" ADD CONSTRAINT "Package_price_check" CHECK ("priceMinor" >= 0);
ALTER TABLE "Opinion" ADD CONSTRAINT "Opinion_estimate_check" CHECK ("estimateMinor" >= 0 AND "version" >= 1);
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_total_check" CHECK ("totalMinor" >= 0 AND "version" >= 1);
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_amounts_check" CHECK ("subtotalMinor" >= 0 AND "taxMinor" >= 0 AND "totalMinor" >= 0);
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_amounts_check" CHECK (
  "quantity" > 0 AND "taxMinor" >= 0 AND "amountMinor" >= 0 AND "cgstMinor" >= 0 AND "sgstMinor" >= 0 AND "igstMinor" >= 0);
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_amount_check" CHECK ("amountMinor" > 0 AND "taxMinor" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_check" CHECK ("amountMinor" > 0 AND ("amountInrMinor" IS NULL OR "amountInrMinor" >= 0));
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_amount_check" CHECK ("amountMinor" > 0);
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_amounts_check" CHECK (("costMinor" IS NULL OR "costMinor" >= 0) AND ("priceMinor" IS NULL OR "priceMinor" >= 0));
ALTER TABLE "StayRoom" ADD CONSTRAINT "StayRoom_rate_check" CHECK ("ratePerNightMinor" >= 0 AND "capacity" > 0 AND "quantity" >= 0);
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_amounts_check" CHECK ("basisMinor" >= 0 AND "amountMinor" >= 0 AND "tdsMinor" >= 0 AND "tdsMinor" <= "amountMinor");
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_amount_check" CHECK ("amountMinor" > 0);
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_amounts_check" CHECK (
  ("estimateMinor" IS NULL OR "estimateMinor" >= 0) AND ("runningBillMinor" IS NULL OR "runningBillMinor" >= 0) AND ("finalBillMinor" IS NULL OR "finalBillMinor" >= 0));
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_dates_check" CHECK ("admittedAt" IS NULL OR "dischargedAt" IS NULL OR "dischargedAt" >= "admittedAt");
ALTER TABLE "Currency" ADD CONSTRAINT "Currency_minor_units_check" CHECK ("minorUnits" BETWEEN 0 AND 4);
ALTER TABLE "FxRate" ADD CONSTRAINT "FxRate_rate_check" CHECK ("rate" > 0 AND "baseCurrency" <> "quoteCurrency");

-- An amount always comes with its currency (the currency columns are nullable where the amount is).
ALTER TABLE "Case" ADD CONSTRAINT "Case_budget_currency_check" CHECK ("budgetMinor" IS NULL OR "budgetCurrency" IS NOT NULL);
ALTER TABLE "Doctor" ADD CONSTRAINT "Doctor_fee_currency_check" CHECK ("consultFeeMinor" IS NULL OR "consultFeeCurrency" IS NOT NULL);
ALTER TABLE "Interpreter" ADD CONSTRAINT "Interpreter_rate_currency_check" CHECK ("hourlyRateMinor" IS NULL OR "hourlyRateCurrency" IS NOT NULL);
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_currency_check" CHECK (("costMinor" IS NULL AND "priceMinor" IS NULL) OR "currency" IS NOT NULL);
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_currency_check" CHECK (
  ("estimateMinor" IS NULL AND "runningBillMinor" IS NULL AND "finalBillMinor" IS NULL) OR "currency" IS NOT NULL);

-- An invoice is for a case or a hospital (a referral-fee invoice is always for a hospital); a payment is for
-- a case or an invoice (a hospital paying its monthly invoice has no case).
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_owner_check" CHECK (
  num_nonnulls("caseId", "hospitalId") >= 1 AND ("kind" <> 'referral_fee' OR "hospitalId" IS NOT NULL));
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_owner_check" CHECK (num_nonnulls("caseId", "invoiceId") >= 1);

-- Rates are basis points: 0 to 10000 is 0% to 100%.
ALTER TABLE "Hospital" ADD CONSTRAINT "Hospital_agreement_check" CHECK ("agreementBp" IS NULL OR "agreementBp" BETWEEN 0 AND 10000);
ALTER TABLE "CommissionPlan" ADD CONSTRAINT "CommissionPlan_rate_check" CHECK ("defaultRateBp" BETWEEN 0 AND 10000);
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_rate_check" CHECK (
  "rateBp" BETWEEN 0 AND 10000 AND ("effectiveFrom" IS NULL OR "effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"));
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_rate_check" CHECK ("rateBp" BETWEEN 0 AND 10000);
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_tax_rate_check" CHECK ("taxRateBp" BETWEEN 0 AND 10000);
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_margin_check" CHECK ("marginBp" IS NULL OR "marginBp" BETWEEN 0 AND 100000);

-- Ratings are 1 to 5.
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_ratings_check" CHECK (
  ("hospitalRating" IS NULL OR "hospitalRating" BETWEEN 1 AND 5) AND
  ("doctorRating" IS NULL OR "doctorRating" BETWEEN 1 AND 5) AND
  ("coordinatorRating" IS NULL OR "coordinatorRating" BETWEEN 1 AND 5) AND
  ("stayRating" IS NULL OR "stayRating" BETWEEN 1 AND 5));

-- Files are 1 byte to 500 MB (PRD section 5.1) and belong to someone: a file nobody owns could never be
-- reached by any access rule.
ALTER TABLE "Document" ADD CONSTRAINT "Document_size_check" CHECK ("sizeBytes" BETWEEN 1 AND 524288000);
ALTER TABLE "Document" ADD CONSTRAINT "Document_owner_check" CHECK (num_nonnulls("patientId", "caseId", "agentId", "hospitalId") >= 1);

-- A visa application is for exactly one traveller: the patient or an attendant.
ALTER TABLE "VisaApplication" ADD CONSTRAINT "VisaApplication_one_traveller_check" CHECK (num_nonnulls("patientId", "attendantId") = 1);

-- Dates that have to make sense.
ALTER TABLE "Accreditation" ADD CONSTRAINT "Accreditation_dates_check" CHECK ("issuedAt" IS NULL OR "expiresAt" IS NULL OR "expiresAt" >= "issuedAt");
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_withdrawn_check" CHECK ("withdrawnAt" IS NULL OR "withdrawnAt" >= "grantedAt");
ALTER TABLE "MedicalSummary" ADD CONSTRAINT "MedicalSummary_version_check" CHECK ("version" >= 1);

-- A consent says who it is for: a hospital-sharing consent names the hospital, an agent one names the agent.
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_target_check" CHECK (
  ("type" <> 'share_medical_with_hospital' OR "hospitalId" IS NOT NULL) AND ("type" <> 'share_stage_with_agent' OR "agentId" IS NOT NULL));

-- A request may only leave draft (or be cancelled) with the patient's consent recorded.
ALTER TABLE "OpinionRequest" ADD CONSTRAINT "OpinionRequest_consent_check" CHECK ("status" IN ('draft', 'cancelled') OR "consentId" IS NOT NULL);

-- A hospital or agent conversation names the hospital or agent it is with.
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_party_check" CHECK (
  ("kind" <> 'hospital' OR "hospitalId" IS NOT NULL) AND ("kind" <> 'agent' OR "agentId" IS NOT NULL));

-- One-at-a-time rules, as partial unique indexes (they ignore soft-deleted and finished rows).
CREATE UNIQUE INDEX "MedicalSummary_one_current_per_case" ON "MedicalSummary"("caseId") WHERE "current";
CREATE UNIQUE INDEX "Opinion_one_current_per_request" ON "Opinion"("opinionRequestId") WHERE "current" AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "OpinionRequest_one_open_per_case_hospital" ON "OpinionRequest"("caseId", "hospitalId")
  WHERE "status" NOT IN ('cancelled', 'expired', 'declined') AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Quote_one_accepted_per_case" ON "Quote"("caseId") WHERE "status" = 'accepted' AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Commission_one_live_per_case_agent" ON "Commission"("caseId", "agentId") WHERE "status" <> 'cancelled' AND "deletedAt" IS NULL;

-- Idempotency for work that is delivered at least once: a retried stage-change event must not create the same
-- automatic task twice, and a replayed WhatsApp webhook must not store the same message twice.
CREATE UNIQUE INDEX "Task_auto_key_per_case" ON "Task"("caseId", "autoKey") WHERE "autoKey" IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Message_external_id_per_channel" ON "Message"("channel", "externalId") WHERE "externalId" IS NOT NULL;

-- Trigram indexes for the fuzzy name and phone lookups behind duplicate detection (PRD 6, lead inbox).
CREATE INDEX "Patient_fullName_trgm_idx" ON "Patient" USING GIN (lower("fullName") gin_trgm_ops);
CREATE INDEX "Patient_phone_trgm_idx" ON "Patient" USING GIN (lower("phone") gin_trgm_ops);

-- ---------------------------------------------------------------------------------------------------
-- The audit trail is append-only: it can be written and read, never rewritten or emptied. Deleting a
-- single row stays possible for the retention job. The application should also connect with a role that
-- is not the table owner and has no UPDATE or TRUNCATE on it (set up with the deployment, see ADR 002).
-- ---------------------------------------------------------------------------------------------------
CREATE FUNCTION audit_event_reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent rows are append-only';
END;
$$;
CREATE TRIGGER "AuditEvent_append_only" BEFORE UPDATE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION audit_event_reject_change();
CREATE TRIGGER "AuditEvent_no_truncate" BEFORE TRUNCATE ON "AuditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_event_reject_change();

-- ---------------------------------------------------------------------------------------------------
-- Consent binding. A hospital sees a patient's document only through a live DocumentShare, and a share can
-- only exist under a consent that is of the right type, for the same patient and the same hospital. When a
-- consent is withdrawn, every share made under it is revoked in the same transaction.
-- ---------------------------------------------------------------------------------------------------
CREATE FUNCTION document_share_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  consent RECORD;
  owner_patient uuid;
BEGIN
  SELECT "type", "patientId", "hospitalId", "withdrawnAt" INTO consent FROM "Consent" WHERE "id" = NEW."consentId";
  SELECT "patientId" INTO owner_patient FROM "Document" WHERE "id" = NEW."documentId";
  IF consent."type" <> 'share_medical_with_hospital' THEN
    RAISE EXCEPTION 'A document share needs a share_medical_with_hospital consent';
  END IF;
  IF owner_patient IS NULL OR owner_patient <> consent."patientId" THEN
    RAISE EXCEPTION 'The consent belongs to a different patient than the document';
  END IF;
  IF consent."hospitalId" IS DISTINCT FROM NEW."hospitalId" THEN
    RAISE EXCEPTION 'The consent is for a different hospital';
  END IF;
  IF TG_OP = 'INSERT' AND consent."withdrawnAt" IS NOT NULL THEN
    RAISE EXCEPTION 'The consent has been withdrawn';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "DocumentShare_consent_check" BEFORE INSERT OR UPDATE OF "documentId", "hospitalId", "consentId" ON "DocumentShare"
  FOR EACH ROW EXECUTE FUNCTION document_share_check();

CREATE FUNCTION consent_withdrawn_revoke_shares() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."withdrawnAt" IS NOT NULL AND OLD."withdrawnAt" IS NULL THEN
    UPDATE "DocumentShare" SET "revokedAt" = NEW."withdrawnAt", "updatedAt" = now()
      WHERE "consentId" = NEW."id" AND "revokedAt" IS NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER "Consent_withdrawn_revoke_shares" AFTER UPDATE OF "withdrawnAt" ON "Consent"
  FOR EACH ROW EXECUTE FUNCTION consent_withdrawn_revoke_shares();

-- ---------------------------------------------------------------------------------------------------
-- Full-text search. Each searchVector is filled by a trigger from the row's own columns and, for
-- treatments, hospitals and doctors, their translations (so Arabic names are found too). A generated
-- column would be simpler, but Prisma then tries to drop its "default" on every migration. The GIN indexes
-- above make `"searchVector" @@ websearch_to_tsquery('simple', f_unaccent('asha'))` fast. The 'simple'
-- configuration keeps names intact in every language; f_unaccent ignores accents and Arabic vowel marks.
-- ---------------------------------------------------------------------------------------------------
CREATE FUNCTION treatment_search_vector() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."searchVector" := to_tsvector('simple'::regconfig, f_unaccent(
    coalesce(NEW."name", '') || ' ' || coalesce(NEW."summary", '') || ' ' ||
    coalesce((SELECT string_agg(coalesce(t."name", '') || ' ' || coalesce(t."summary", ''), ' ')
              FROM "TreatmentTranslation" t WHERE t."treatmentId" = NEW."id"), '')));
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Treatment_search_vector" BEFORE INSERT OR UPDATE ON "Treatment"
  FOR EACH ROW EXECUTE FUNCTION treatment_search_vector();

CREATE FUNCTION patient_search_vector() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Name, phone (as typed and digits only), passport number and email (PRD 6: duplicate detection and the
  -- lead inbox look patients up by these).
  NEW."searchVector" := to_tsvector('simple'::regconfig, f_unaccent(
    coalesce(NEW."fullName", '') || ' ' || coalesce(NEW."phone", '') || ' ' ||
    regexp_replace(coalesce(NEW."phone", ''), '\D', '', 'g') || ' ' ||
    coalesce(NEW."passportNumber", '') || ' ' || coalesce(NEW."email", '')));
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Patient_search_vector" BEFORE INSERT OR UPDATE ON "Patient"
  FOR EACH ROW EXECUTE FUNCTION patient_search_vector();

CREATE FUNCTION hospital_search_vector() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."searchVector" := to_tsvector('simple'::regconfig, f_unaccent(
    coalesce(NEW."name", '') || ' ' || coalesce(NEW."address", '') || ' ' ||
    coalesce((SELECT string_agg(coalesce(t."name", ''), ' ') FROM "HospitalTranslation" t WHERE t."hospitalId" = NEW."id"), '')));
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Hospital_search_vector" BEFORE INSERT OR UPDATE ON "Hospital"
  FOR EACH ROW EXECUTE FUNCTION hospital_search_vector();

CREATE FUNCTION doctor_search_vector() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."searchVector" := to_tsvector('simple'::regconfig, f_unaccent(
    coalesce(NEW."fullName", '') || ' ' || coalesce(NEW."qualifications", '') || ' ' ||
    coalesce((SELECT string_agg(coalesce(t."fullName", '') || ' ' || coalesce(t."qualifications", ''), ' ')
              FROM "DoctorTranslation" t WHERE t."doctorId" = NEW."id"), '')));
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Doctor_search_vector" BEFORE INSERT OR UPDATE ON "Doctor"
  FOR EACH ROW EXECUTE FUNCTION doctor_search_vector();

-- When a translation changes, touch its parent so the parent's vector is rebuilt.
CREATE FUNCTION refresh_treatment_search() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN parent := OLD."treatmentId"; ELSE parent := NEW."treatmentId"; END IF;
  UPDATE "Treatment" SET "updatedAt" = "updatedAt" WHERE "id" = parent;
  RETURN NULL;
END;
$$;
CREATE TRIGGER "TreatmentTranslation_refresh_search" AFTER INSERT OR UPDATE OR DELETE ON "TreatmentTranslation"
  FOR EACH ROW EXECUTE FUNCTION refresh_treatment_search();

CREATE FUNCTION refresh_hospital_search() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN parent := OLD."hospitalId"; ELSE parent := NEW."hospitalId"; END IF;
  UPDATE "Hospital" SET "updatedAt" = "updatedAt" WHERE "id" = parent;
  RETURN NULL;
END;
$$;
CREATE TRIGGER "HospitalTranslation_refresh_search" AFTER INSERT OR UPDATE OR DELETE ON "HospitalTranslation"
  FOR EACH ROW EXECUTE FUNCTION refresh_hospital_search();

CREATE FUNCTION refresh_doctor_search() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN parent := OLD."doctorId"; ELSE parent := NEW."doctorId"; END IF;
  UPDATE "Doctor" SET "updatedAt" = "updatedAt" WHERE "id" = parent;
  RETURN NULL;
END;
$$;
CREATE TRIGGER "DoctorTranslation_refresh_search" AFTER INSERT OR UPDATE OR DELETE ON "DoctorTranslation"
  FOR EACH ROW EXECUTE FUNCTION refresh_doctor_search();
