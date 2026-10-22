-- Extensions. pg_trgm powers fuzzy search and duplicate detection, unaccent makes search ignore
-- diacritics. Both are "trusted" extensions in PostgreSQL 13+, so the database owner can create them.
-- (infra/postgres/init creates them for local development too; IF NOT EXISTS makes both safe.)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent() is not IMMUTABLE, so it cannot be used in a generated column or an index directly.
-- This wrapper pins the dictionary and is declared immutable, the standard workaround.
CREATE OR REPLACE FUNCTION f_unaccent(text)
  RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent', $1) $$;

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
CREATE TYPE "DocumentKind" AS ENUM ('report', 'scan', 'prescription', 'passport', 'visa', 'invoice', 'discharge', 'invitation_letter', 'photo', 'agreement', 'other');

-- CreateEnum
CREATE TYPE "DocumentVisibility" AS ENUM ('private', 'shared', 'internal');

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
CREATE TYPE "PaymentType" AS ENUM ('deposit', 'service', 'pass_through', 'add_on');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('card', 'bank_wire', 'upi', 'payment_link', 'cash', 'other');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'authorized', 'succeeded', 'failed', 'cancelled', 'partially_refunded', 'refunded');

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
CREATE TYPE "BookingStatus" AS ENUM ('requested', 'confirmed', 'in_progress', 'completed', 'cancelled');

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
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound', 'internal');

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
    "title" TEXT,
    "languages" TEXT[],
    "assignable" BOOLEAN NOT NULL DEFAULT true,
    "maxOpenCases" INTEGER,
    "lastAssignedAt" TIMESTAMPTZ(3),
    "userId" UUID NOT NULL,
    "cityId" UUID,
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
    "conditionSummary" TEXT,
    "urgency" "Urgency" NOT NULL DEFAULT 'routine',
    "budgetMinor" INTEGER,
    "source" "CaseSource" NOT NULL DEFAULT 'website',
    "campaign" TEXT,
    "preferredLanguage" VARCHAR(8),
    "stageEnteredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "consentId" UUID,
    "sharedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "DocumentShare_pkey" PRIMARY KEY ("id")
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
    "fullName" TEXT NOT NULL,
    "qualifications" TEXT,
    "experienceYears" INTEGER,
    "languages" TEXT[],
    "consultFeeMinor" INTEGER,
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
    "priceMinor" INTEGER NOT NULL,
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
    "sentById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "OpinionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opinion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "treatmentPlan" TEXT NOT NULL,
    "stayDaysHospital" INTEGER,
    "stayDaysOutside" INTEGER,
    "estimateMinor" INTEGER NOT NULL,
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
    "totalMinor" INTEGER NOT NULL,
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
    "unitPriceMinor" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "costMinor" INTEGER,
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
    "kind" "InvoiceKind" NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "subtotalMinor" INTEGER NOT NULL,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,
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
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceMinor" INTEGER NOT NULL,
    "taxRateBp" INTEGER NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "amountMinor" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "invoiceId" UUID NOT NULL,
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
    "amountMinor" INTEGER NOT NULL,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
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
    "amountMinor" INTEGER NOT NULL,
    "amountInrMinor" INTEGER,
    "fxRate" DECIMAL(18,8),
    "gateway" TEXT,
    "gatewayRef" TEXT,
    "payerName" TEXT,
    "failureReason" TEXT,
    "paidAt" TIMESTAMPTZ(3),
    "caseId" UUID NOT NULL,
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
    "amountMinor" INTEGER NOT NULL,
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
    "ratePerNightMinor" INTEGER NOT NULL,
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
    "hourlyRateMinor" INTEGER,
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
    "costMinor" INTEGER,
    "priceMinor" INTEGER,
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
    "basisMinor" INTEGER NOT NULL,
    "rateBp" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,
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
    "amountMinor" INTEGER NOT NULL,
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
    "caseId" UUID,
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
    "entityId" UUID NOT NULL,
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
    "type" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" UUID NOT NULL,
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
CREATE INDEX "FxRate_baseCurrency_quoteCurrency_asOf_idx" ON "FxRate"("baseCurrency", "quoteCurrency", "asOf");

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
CREATE UNIQUE INDEX "AgentUser_userId_key" ON "AgentUser"("userId");

-- CreateIndex
CREATE INDEX "AgentUser_agentId_idx" ON "AgentUser"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_userId_key" ON "Patient"("userId");

-- CreateIndex
CREATE INDEX "Patient_phone_idx" ON "Patient"("phone");

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
CREATE INDEX "Case_stage_idx" ON "Case"("stage");

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
CREATE INDEX "OpinionRequest_hospitalId_status_idx" ON "OpinionRequest"("hospitalId", "status");

-- CreateIndex
CREATE INDEX "OpinionRequest_dueAt_idx" ON "OpinionRequest"("dueAt");

-- CreateIndex
CREATE INDEX "OpinionRequest_doctorId_idx" ON "OpinionRequest"("doctorId");

-- CreateIndex
CREATE INDEX "OpinionRequest_summaryId_idx" ON "OpinionRequest"("summaryId");

-- CreateIndex
CREATE INDEX "OpinionRequest_sentById_idx" ON "OpinionRequest"("sentById");

-- CreateIndex
CREATE UNIQUE INDEX "OpinionRequest_caseId_hospitalId_key" ON "OpinionRequest"("caseId", "hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "Opinion_opinionRequestId_key" ON "Opinion"("opinionRequestId");

-- CreateIndex
CREATE INDEX "Opinion_doctorId_idx" ON "Opinion"("doctorId");

-- CreateIndex
CREATE INDEX "Opinion_packageId_idx" ON "Opinion"("packageId");

-- CreateIndex
CREATE INDEX "Opinion_submittedById_idx" ON "Opinion"("submittedById");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_quoteNo_key" ON "Quote"("quoteNo");

-- CreateIndex
CREATE INDEX "Quote_status_idx" ON "Quote"("status");

-- CreateIndex
CREATE INDEX "Quote_caseId_idx" ON "Quote"("caseId");

-- CreateIndex
CREATE INDEX "Quote_opinionId_idx" ON "Quote"("opinionId");

-- CreateIndex
CREATE INDEX "Quote_acceptedById_idx" ON "Quote"("acceptedById");

-- CreateIndex
CREATE INDEX "Quote_createdById_idx" ON "Quote"("createdById");

-- CreateIndex
CREATE INDEX "Quote_pdfId_idx" ON "Quote"("pdfId");

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
CREATE INDEX "Commission_status_idx" ON "Commission"("status");

-- CreateIndex
CREATE INDEX "Commission_agentId_idx" ON "Commission"("agentId");

-- CreateIndex
CREATE INDEX "Commission_payoutId_idx" ON "Commission"("payoutId");

-- CreateIndex
CREATE UNIQUE INDEX "Commission_caseId_agentId_key" ON "Commission"("caseId", "agentId");

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
CREATE INDEX "Message_channel_externalId_idx" ON "Message"("channel", "externalId");

-- CreateIndex
CREATE INDEX "Message_caseId_idx" ON "Message"("caseId");

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
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_patientId_createdAt_idx" ON "AuditEvent"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_availableAt_idx" ON "OutboxEvent"("status", "availableAt");

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
ALTER TABLE "DocumentShare" ADD CONSTRAINT "DocumentShare_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "Consent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentShare" ADD CONSTRAINT "DocumentShare_sharedById_fkey" FOREIGN KEY ("sharedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "Message" ADD CONSTRAINT "Message_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
-- Rules Prisma cannot express: value checks, one-current-version, append-only audit.
-- ---------------------------------------------------------------------------------------------------

-- Emails are stored lower-case, so the unique index is effectively case-insensitive.
ALTER TABLE "User" ADD CONSTRAINT "User_email_lowercase_check" CHECK ("email" IS NULL OR "email" = lower("email"));
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_email_lowercase_check" CHECK ("email" IS NULL OR "email" = lower("email"));

-- Money is never negative and a payment, refund or payout is never zero.
ALTER TABLE "Case" ADD CONSTRAINT "Case_budget_check" CHECK ("budgetMinor" IS NULL OR "budgetMinor" >= 0);
ALTER TABLE "Package" ADD CONSTRAINT "Package_price_check" CHECK ("priceMinor" >= 0);
ALTER TABLE "Opinion" ADD CONSTRAINT "Opinion_estimate_check" CHECK ("estimateMinor" >= 0);
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_total_check" CHECK ("totalMinor" >= 0);
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_amounts_check" CHECK ("subtotalMinor" >= 0 AND "taxMinor" >= 0 AND "totalMinor" >= 0);
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_amounts_check" CHECK ("quantity" > 0 AND "taxMinor" >= 0 AND "amountMinor" >= 0);
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_amount_check" CHECK ("amountMinor" > 0 AND "taxMinor" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_check" CHECK ("amountMinor" > 0 AND ("amountInrMinor" IS NULL OR "amountInrMinor" >= 0));
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_amount_check" CHECK ("amountMinor" > 0);
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_amounts_check" CHECK (("costMinor" IS NULL OR "costMinor" >= 0) AND ("priceMinor" IS NULL OR "priceMinor" >= 0));
ALTER TABLE "StayRoom" ADD CONSTRAINT "StayRoom_rate_check" CHECK ("ratePerNightMinor" >= 0 AND "capacity" > 0 AND "quantity" >= 0);
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_amounts_check" CHECK ("basisMinor" >= 0 AND "amountMinor" >= 0);
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_amount_check" CHECK ("amountMinor" > 0);
ALTER TABLE "Currency" ADD CONSTRAINT "Currency_minor_units_check" CHECK ("minorUnits" BETWEEN 0 AND 4);
ALTER TABLE "FxRate" ADD CONSTRAINT "FxRate_rate_check" CHECK ("rate" > 0 AND "baseCurrency" <> "quoteCurrency");

-- Rates are basis points: 0 to 10000 is 0% to 100%.
ALTER TABLE "Hospital" ADD CONSTRAINT "Hospital_agreement_check" CHECK ("agreementBp" IS NULL OR "agreementBp" BETWEEN 0 AND 10000);
ALTER TABLE "CommissionPlan" ADD CONSTRAINT "CommissionPlan_rate_check" CHECK ("defaultRateBp" BETWEEN 0 AND 10000);
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_rate_check" CHECK ("rateBp" BETWEEN 0 AND 10000);
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_rate_check" CHECK ("rateBp" BETWEEN 0 AND 10000);
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_tax_rate_check" CHECK ("taxRateBp" BETWEEN 0 AND 10000);
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_margin_check" CHECK ("marginBp" IS NULL OR "marginBp" BETWEEN 0 AND 100000);

-- Ratings are 1 to 5.
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_ratings_check" CHECK (
  ("hospitalRating" IS NULL OR "hospitalRating" BETWEEN 1 AND 5) AND
  ("doctorRating" IS NULL OR "doctorRating" BETWEEN 1 AND 5) AND
  ("coordinatorRating" IS NULL OR "coordinatorRating" BETWEEN 1 AND 5) AND
  ("stayRating" IS NULL OR "stayRating" BETWEEN 1 AND 5));

-- Files are 1 byte to 500 MB (PRD section 5.1).
ALTER TABLE "Document" ADD CONSTRAINT "Document_size_check" CHECK ("sizeBytes" BETWEEN 1 AND 524288000);

-- A visa application is for exactly one traveller: the patient or an attendant.
ALTER TABLE "VisaApplication" ADD CONSTRAINT "VisaApplication_one_traveller_check" CHECK (num_nonnulls("patientId", "attendantId") = 1);

-- Dates that have to make sense.
ALTER TABLE "Accreditation" ADD CONSTRAINT "Accreditation_dates_check" CHECK ("issuedAt" IS NULL OR "expiresAt" IS NULL OR "expiresAt" >= "issuedAt");
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_withdrawn_check" CHECK ("withdrawnAt" IS NULL OR "withdrawnAt" >= "grantedAt");
ALTER TABLE "MedicalSummary" ADD CONSTRAINT "MedicalSummary_version_check" CHECK ("version" >= 1);

-- Exactly one current medical summary per case; older versions are kept but not current.
CREATE UNIQUE INDEX "MedicalSummary_one_current_per_case" ON "MedicalSummary"("caseId") WHERE "current";

-- The audit trail is append-only: it can be written and read, never rewritten. (Deleting is left to the
-- retention job, which is the only thing allowed to.)
CREATE FUNCTION audit_event_reject_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent rows are append-only';
END;
$$;
CREATE TRIGGER "AuditEvent_append_only" BEFORE UPDATE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION audit_event_reject_update();

-- ---------------------------------------------------------------------------------------------------
-- Full-text search. Each searchVector is filled by a trigger from the row's own columns (a generated
-- column would be simpler, but Prisma then tries to drop its "default" on every migration). The GIN
-- indexes above make `searchVector @@ to_tsquery('simple', 'asha:*')` fast. The 'simple' configuration
-- keeps names intact in every language; f_unaccent makes searches ignore diacritics.
-- ---------------------------------------------------------------------------------------------------
CREATE FUNCTION treatment_search_vector() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."searchVector" := to_tsvector('simple'::regconfig, f_unaccent(coalesce(NEW."name", '') || ' ' || coalesce(NEW."summary", '')));
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Treatment_search_vector" BEFORE INSERT OR UPDATE ON "Treatment"
  FOR EACH ROW EXECUTE FUNCTION treatment_search_vector();

CREATE FUNCTION patient_search_vector() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Name, phone (as typed and digits only), passport number and email.
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
  NEW."searchVector" := to_tsvector('simple'::regconfig, f_unaccent(coalesce(NEW."name", '') || ' ' || coalesce(NEW."address", '')));
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Hospital_search_vector" BEFORE INSERT OR UPDATE ON "Hospital"
  FOR EACH ROW EXECUTE FUNCTION hospital_search_vector();

CREATE FUNCTION doctor_search_vector() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."searchVector" := to_tsvector('simple'::regconfig, f_unaccent(coalesce(NEW."fullName", '') || ' ' || coalesce(NEW."qualifications", '')));
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Doctor_search_vector" BEFORE INSERT OR UPDATE ON "Doctor"
  FOR EACH ROW EXECUTE FUNCTION doctor_search_vector();
