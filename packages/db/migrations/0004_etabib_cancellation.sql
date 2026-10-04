ALTER TYPE "notification_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TYPE "consultation_status" ADD VALUE 'CANCELLED';--> statement-breakpoint
DROP INDEX IF EXISTS "consultation_cases_active_sender_uq";--> statement-breakpoint
ALTER TABLE "consultation_cases" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consultation_cases" ADD COLUMN "cancelled_by" uuid;--> statement-breakpoint
ALTER TABLE "consultation_cases" ADD COLUMN "cancelled_by_role" text;--> statement-breakpoint
ALTER TABLE "consultation_cases" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "consultation_cases" ADD COLUMN "cancellation_note" text;--> statement-breakpoint
ALTER TABLE "consultation_cases" ADD COLUMN "cancelled_from_status" "consultation_status";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "consultation_cases" ADD CONSTRAINT "consultation_cases_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "consultation_cases_active_sender_uq" ON "consultation_cases" USING btree ("whatsapp_phone") WHERE status <> 'COMPLETED' AND cancelled_at IS NULL AND whatsapp_phone IS NOT NULL;--> statement-breakpoint
-- ---- Hand-added: a CANCELLED case always carries when/why/from-where (text cast: the new enum value is not used in this transaction) ----
DO $$ BEGIN
 ALTER TABLE "consultation_cases" ADD CONSTRAINT "consultation_cases_cancelled_check" CHECK (status::text <> 'CANCELLED' OR (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL AND cancelled_from_status IS NOT NULL));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
