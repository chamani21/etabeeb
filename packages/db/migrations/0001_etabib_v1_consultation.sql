DO $$ BEGIN
 CREATE TYPE "public"."case_actor_type" AS ENUM('SYSTEM', 'PATIENT', 'ADMIN', 'DOCTOR', 'N8N');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."consultation_for" AS ENUM('SELF', 'OTHER');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."consultation_payment_source" AS ENUM('EASYPAISA', 'OTHER');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."consultation_patient_sex" AS ENUM('MALE', 'FEMALE');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."consultation_status" AS ENUM('NEW', 'ADMIN_INTAKE', 'INTAKE_COMPLETE', 'AWAITING_PAYMENT', 'PAYMENT_RECEIVED', 'AWAITING_DOCTOR_APPROVAL', 'CONFIRMED', 'IN_CONSULTATION', 'PRESCRIPTION_SENT', 'COMPLETED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."doctor_decision" AS ENUM('PENDING', 'APPROVED', 'PROPOSE_NEW_TIME', 'POSTPONED', 'REJECTED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "case_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consultation_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"old_status" "consultation_status",
	"new_status" "consultation_status",
	"actor_type" "case_actor_type" NOT NULL,
	"actor_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "consultation_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "consultation_status" DEFAULT 'NEW' NOT NULL,
	"whatsapp_phone" text,
	"patient_name" text,
	"patient_phone" text,
	"age" integer,
	"sex" "consultation_patient_sex",
	"consultation_for" "consultation_for",
	"location" text,
	"main_complaint" text,
	"medical_history" text,
	"payment_received" boolean DEFAULT false NOT NULL,
	"payment_source" "consultation_payment_source",
	"payment_reference" text,
	"payment_amount" integer,
	"payment_confirmed_by" uuid,
	"payment_confirmed_at" timestamp with time zone,
	"proposed_consultation_time" timestamp with time zone,
	"doctor_decision" "doctor_decision",
	"doctor_approved_time" timestamp with time zone,
	"doctor_decision_at" timestamp with time zone,
	"consultation_link" text,
	"prescription_id" uuid,
	"prescription_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text DEFAULT 'n8n' NOT NULL,
	"workflow_name" text NOT NULL,
	"workflow_id" text,
	"node" text,
	"execution_id" text,
	"error_message" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "whatsapp_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wamid" text NOT NULL,
	"sender_phone" text NOT NULL,
	"event_type" text NOT NULL,
	"consultation_id" uuid,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_events_wamid_uq" UNIQUE("wamid")
);
--> statement-breakpoint
ALTER TABLE "prescriptions" ALTER COLUMN "encounter_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "prescriptions" ALTER COLUMN "appointment_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "prescriptions" ALTER COLUMN "prescribed_for_user_id" DROP NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "case_events" ADD CONSTRAINT "case_events_consultation_id_consultation_cases_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultation_cases"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "consultation_cases" ADD CONSTRAINT "consultation_cases_payment_confirmed_by_users_id_fk" FOREIGN KEY ("payment_confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "consultation_cases" ADD CONSTRAINT "consultation_cases_prescription_id_prescriptions_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescriptions"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whatsapp_events" ADD CONSTRAINT "whatsapp_events_consultation_id_consultation_cases_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultation_cases"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_events_consultation_idx" ON "case_events" USING btree ("consultation_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consultation_cases_status_idx" ON "consultation_cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consultation_cases_patient_phone_idx" ON "consultation_cases" USING btree ("patient_phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consultation_cases_created_at_idx" ON "consultation_cases" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "consultation_cases_active_sender_uq" ON "consultation_cases" USING btree ("whatsapp_phone") WHERE status <> 'COMPLETED' AND whatsapp_phone IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "consultation_cases_prescription_uq" ON "consultation_cases" USING btree ("prescription_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "integration_errors_execution_node_uq" ON "integration_errors" USING btree ("source","execution_id","node");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_errors_occurred_idx" ON "integration_errors" USING btree ("occurred_at");--> statement-breakpoint
-- ---- Hand-added (drizzle-kit 0.24 does not emit CHECK constraints or triggers) ----
DO $$ BEGIN
 ALTER TABLE "consultation_cases" ADD CONSTRAINT "consultation_cases_age_check" CHECK (age IS NULL OR (age >= 0 AND age <= 130));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "consultation_cases" ADD CONSTRAINT "consultation_cases_payment_amount_check" CHECK (payment_amount IS NULL OR payment_amount >= 0);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Database-level backstop for the CONFIRMED guard: no row can be in a
-- post-confirmation state without manual payment confirmation and an
-- explicit doctor approval with an approved time.
DO $$ BEGIN
 ALTER TABLE "consultation_cases" ADD CONSTRAINT "consultation_cases_confirmed_guard_check" CHECK (
  status NOT IN ('CONFIRMED', 'IN_CONSULTATION', 'PRESCRIPTION_SENT', 'COMPLETED')
  OR (
   payment_received = true
   AND payment_confirmed_at IS NOT NULL
   AND payment_confirmed_by IS NOT NULL
   AND doctor_decision = 'APPROVED'
   AND doctor_approved_time IS NOT NULL
  )
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "case_events_block_mutation"() RETURNS trigger AS $$
BEGIN
 RAISE EXCEPTION 'case_events is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "case_events_immutable" ON "case_events";
--> statement-breakpoint
CREATE TRIGGER "case_events_immutable" BEFORE UPDATE OR DELETE ON "case_events"
 FOR EACH ROW EXECUTE FUNCTION "case_events_block_mutation"();
