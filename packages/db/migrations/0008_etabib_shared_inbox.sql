DO $$ BEGIN
 CREATE TYPE "public"."wa_conversation_owner" AS ENUM('BOT', 'ADMIN', 'DOCTOR');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."wa_attachment_fetch" AS ENUM('PENDING', 'REQUESTED', 'STORED', 'FAILED', 'UNSUPPORTED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."wa_case_link" AS ENUM('AUTO', 'MANUAL', 'NEEDED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."wa_handover_status" AS ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."wa_message_direction" AS ENUM('IN', 'OUT');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."wa_sender_role" AS ENUM('PATIENT', 'BOT', 'SYSTEM', 'ADMIN', 'DOCTOR');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wa_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid,
	"case_id" uuid,
	"source" text NOT NULL,
	"provider_media_id" text,
	"declared_mime_type" text,
	"mime_type" text,
	"size_bytes" integer,
	"sha256" text,
	"storage_key" text,
	"delivery_key" text,
	"duration_ms" integer,
	"filename" text,
	"fetch_status" "wa_attachment_fetch" DEFAULT 'PENDING' NOT NULL,
	"fetch_attempts" integer DEFAULT 0 NOT NULL,
	"fetch_error" text,
	"fetch_requested_at" timestamp with time zone,
	"label" text,
	"flagged_at" timestamp with time zone,
	"flagged_by" uuid,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wa_conversation_reads" (
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_at" timestamp with time zone NOT NULL,
	CONSTRAINT "wa_conversation_reads_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wa_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_phone" text NOT NULL,
	"profile_name" text,
	"owner" "wa_conversation_owner" DEFAULT 'BOT' NOT NULL,
	"owner_user_id" uuid,
	"owner_version" integer DEFAULT 1 NOT NULL,
	"last_patient_message_at" timestamp with time zone,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wa_handover_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"status" "wa_handover_status" DEFAULT 'PENDING' NOT NULL,
	"summary" text,
	"attachment_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"decline_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wa_internal_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"author_role" text NOT NULL,
	"body" text NOT NULL,
	"case_id" uuid,
	"kind" text DEFAULT 'NOTE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wa_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" "wa_message_direction" NOT NULL,
	"sender_role" "wa_sender_role" NOT NULL,
	"sender_user_id" uuid,
	"kind" text NOT NULL,
	"body" text,
	"provider_message_id" text,
	"client_request_key" text,
	"reply_to_provider_id" text,
	"outbox_job_id" uuid,
	"owner_version" integer,
	"case_id" uuid,
	"case_link" "wa_case_link" DEFAULT 'NEEDED' NOT NULL,
	"local_status" text,
	"historical" boolean DEFAULT false NOT NULL,
	"provider_timestamp" timestamp with time zone,
	"business_phone_number_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wa_attachments" ADD CONSTRAINT "wa_attachments_conversation_id_wa_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."wa_conversations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wa_attachments" ADD CONSTRAINT "wa_attachments_message_id_wa_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."wa_messages"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wa_attachments" ADD CONSTRAINT "wa_attachments_case_id_consultation_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."consultation_cases"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wa_attachments" ADD CONSTRAINT "wa_attachments_flagged_by_users_id_fk" FOREIGN KEY ("flagged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wa_attachments" ADD CONSTRAINT "wa_attachments_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wa_conversation_reads" ADD CONSTRAINT "wa_conversation_reads_conversation_id_wa_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."wa_conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wa_conversation_reads" ADD CONSTRAINT "wa_conversation_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wa_conversations" ADD CONSTRAINT "wa_conversations_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wa_handover_requests" ADD CONSTRAINT "wa_handover_requests_conversation_id_wa_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."wa_conversations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wa_handover_requests" ADD CONSTRAINT "wa_handover_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wa_handover_requests" ADD CONSTRAINT "wa_handover_requests_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wa_handover_requests" ADD CONSTRAINT "wa_handover_requests_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wa_internal_notes" ADD CONSTRAINT "wa_internal_notes_conversation_id_wa_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."wa_conversations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wa_internal_notes" ADD CONSTRAINT "wa_internal_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wa_internal_notes" ADD CONSTRAINT "wa_internal_notes_case_id_consultation_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."consultation_cases"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_conversation_id_wa_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."wa_conversations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_outbox_job_id_notification_outbox_id_fk" FOREIGN KEY ("outbox_job_id") REFERENCES "public"."notification_outbox"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_case_id_consultation_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."consultation_cases"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wa_attachments_conversation_idx" ON "wa_attachments" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wa_attachments_media_uq" ON "wa_attachments" USING btree ("provider_media_id") WHERE provider_media_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wa_attachments_fetch_idx" ON "wa_attachments" USING btree ("fetch_status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wa_conversations_contact_uq" ON "wa_conversations" USING btree ("contact_phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wa_conversations_last_message_idx" ON "wa_conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wa_handover_one_pending_uq" ON "wa_handover_requests" USING btree ("conversation_id") WHERE status = 'PENDING';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wa_handover_to_user_idx" ON "wa_handover_requests" USING btree ("to_user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wa_internal_notes_conversation_idx" ON "wa_internal_notes" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wa_messages_conversation_idx" ON "wa_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wa_messages_provider_uq" ON "wa_messages" USING btree ("provider_message_id") WHERE provider_message_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wa_messages_client_key_uq" ON "wa_messages" USING btree ("client_request_key") WHERE client_request_key IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wa_messages_outbox_uq" ON "wa_messages" USING btree ("outbox_job_id") WHERE outbox_job_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wa_messages_case_idx" ON "wa_messages" USING btree ("case_id");--> statement-breakpoint
-- History import (additive, read-only on existing tables). Message CONTENT was
-- never stored before the inbox: imported rows are marked historical=true and
-- carry only what the ledger/outbox recorded (type, time, case, delivery job).
INSERT INTO "wa_conversations" ("contact_phone", "last_patient_message_at", "last_message_at", "created_at")
SELECT e."sender_phone", max(e."created_at"), max(e."created_at"), min(e."created_at")
FROM "whatsapp_events" e
WHERE e."consultation_id" IS NOT NULL AND (e."disposition" IS NULL OR e."disposition" = 'processed')
GROUP BY e."sender_phone"
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "wa_conversations" ("contact_phone", "created_at")
SELECT c."whatsapp_phone", min(c."created_at")
FROM "consultation_cases" c
WHERE c."whatsapp_phone" IS NOT NULL
GROUP BY c."whatsapp_phone"
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "wa_messages" ("conversation_id", "direction", "sender_role", "kind", "provider_message_id", "case_id", "case_link", "local_status", "historical", "provider_timestamp", "created_at")
SELECT conv."id", 'IN', 'PATIENT', left(e."event_type", 32), e."wamid", e."consultation_id", 'AUTO', 'received', true, e."created_at", e."created_at"
FROM "whatsapp_events" e
JOIN "wa_conversations" conv ON conv."contact_phone" = e."sender_phone"
WHERE e."consultation_id" IS NOT NULL AND (e."disposition" IS NULL OR e."disposition" = 'processed')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "wa_messages" ("conversation_id", "direction", "sender_role", "kind", "outbox_job_id", "case_id", "case_link", "historical", "created_at")
SELECT conv."id", 'OUT',
  (CASE WHEN o."template_key" IN ('ASK_PATIENT_NAME', 'ASK_PATIENT_PHONE', 'PATIENT_ACKNOWLEDGED', 'PATIENT_CASE_IN_PROGRESS') THEN 'BOT' ELSE 'SYSTEM' END)::"wa_sender_role",
  (CASE o."template_key" WHEN 'PRESCRIPTION_IMAGE' THEN 'image' WHEN 'PRESCRIPTION_VOICE' THEN 'audio' ELSE 'text' END),
  o."id", cc."id", 'AUTO', true, o."created_at"
FROM "notification_outbox" o
JOIN "consultation_cases" cc ON o."template_variables" ~ '"consultationId":"[0-9a-f-]{36}"'
  AND cc."id" = (substring(o."template_variables" from '"consultationId":"([0-9a-f-]{36})"'))::uuid
JOIN "wa_conversations" conv ON conv."contact_phone" = coalesce(o."recipient_phone", cc."whatsapp_phone")
WHERE o."idempotency_key" LIKE 'etabib:%'
  AND o."template_key" IN ('ASK_PATIENT_NAME', 'ASK_PATIENT_PHONE', 'PATIENT_ACKNOWLEDGED', 'PATIENT_CASE_IN_PROGRESS', 'CONSULTATION_CONFIRMED_PATIENT', 'PRESCRIPTION_READY', 'CONSULTATION_CANCELLED_PATIENT', 'PRESCRIPTION_IMAGE', 'PRESCRIPTION_VOICE')
ON CONFLICT DO NOTHING;
