DO $$ BEGIN
 CREATE TYPE "public"."whatsapp_sender_purpose" AS ENUM('PATIENT_TEST', 'STAFF', 'PILOT_PATIENT', 'BLOCKED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "etabib_runtime_status" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" uuid,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "whatsapp_allowed_senders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_e164" text NOT NULL,
	"label" text NOT NULL,
	"purpose" "whatsapp_sender_purpose" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "session_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "diagnosis" text;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "investigations" text;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "advice" text;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "follow_up" text;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "consultation_cases" ADD COLUMN "admin_notes" text;--> statement-breakpoint
ALTER TABLE "whatsapp_events" ADD COLUMN "disposition" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_audit_events" ADD CONSTRAINT "staff_audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whatsapp_allowed_senders" ADD CONSTRAINT "whatsapp_allowed_senders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whatsapp_allowed_senders" ADD CONSTRAINT "whatsapp_allowed_senders_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_hash_uq" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_audit_events_created_idx" ON "staff_audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_allowed_senders_phone_uq" ON "whatsapp_allowed_senders" USING btree ("phone_e164");--> statement-breakpoint
-- ---- Hand-added (drizzle-kit 0.24 does not emit CHECK constraints or triggers) ----
DO $$ BEGIN
 ALTER TABLE "whatsapp_allowed_senders" ADD CONSTRAINT "whatsapp_allowed_senders_phone_e164_check" CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "staff_audit_events_block_mutation"() RETURNS trigger AS $$
BEGIN
 RAISE EXCEPTION 'staff_audit_events is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "staff_audit_events_immutable" ON "staff_audit_events";
--> statement-breakpoint
CREATE TRIGGER "staff_audit_events_immutable" BEFORE UPDATE OR DELETE ON "staff_audit_events"
 FOR EACH ROW EXECUTE FUNCTION "staff_audit_events_block_mutation"();
