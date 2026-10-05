CREATE TABLE IF NOT EXISTS "prescription_voice_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prescription_id" uuid NOT NULL,
	"original_key" text NOT NULL,
	"original_mime_type" text NOT NULL,
	"audio_key" text NOT NULL,
	"mime_type" text DEFAULT 'audio/ogg' NOT NULL,
	"size_bytes" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"include_in_delivery" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "prescription_items" ALTER COLUMN "dose" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "prescription_items" ALTER COLUMN "frequency" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "prescription_items" ADD COLUMN "duration" text;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "consultation_id" uuid;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "rx_number" text;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "amended_from_id" uuid;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "workflow_status" text DEFAULT 'FINALIZED' NOT NULL;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "finalized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "free_text" text;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "red_flags" text;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "follow_up_interval" text;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "vitals" jsonb;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "image_keys" jsonb;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "rendered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "render_error" text;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "delivery_requested_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prescription_voice_notes" ADD CONSTRAINT "prescription_voice_notes_prescription_id_prescriptions_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescriptions"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prescription_voice_notes" ADD CONSTRAINT "prescription_voice_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prescription_voice_notes_prescription_idx" ON "prescription_voice_notes" USING btree ("prescription_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prescriptions_consultation_idx" ON "prescriptions" USING btree ("consultation_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prescriptions_rx_revision_uq" ON "prescriptions" USING btree ("rx_number","revision");--> statement-breakpoint
-- ---- Hand-added: prescription ↔ consultation link (no Drizzle reference: import cycle) ----
DO $$ BEGIN
 ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_consultation_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultation_cases"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_workflow_status_check" CHECK ("workflow_status" IN ('DRAFT', 'FINALIZED', 'SUPERSEDED'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "prescription_rx_number_seq" START 1;
--> statement-breakpoint
-- ---- Backfill: existing eTabib V1 prescriptions become finalized revision 1 of their case ----
UPDATE "prescriptions" p
SET "consultation_id" = c."id",
    "rx_number" = 'ETB-RX-' || to_char(coalesce(p."signed_at", p."created_at") AT TIME ZONE 'Asia/Karachi', 'YYYYMMDD') || '-' || lpad(nextval('prescription_rx_number_seq')::text, 5, '0'),
    "finalized_at" = coalesce(p."signed_at", p."created_at"),
    "locked_at" = coalesce(p."signed_at", p."created_at"),
    "delivery_requested_at" = c."prescription_sent_at"
FROM "consultation_cases" c
WHERE c."prescription_id" = p."id" AND p."consultation_id" IS NULL;
--> statement-breakpoint
-- ---- Immutability backstop: a finalized eTabib prescription's clinical content can never change ----
CREATE OR REPLACE FUNCTION etabib_prescription_lock() RETURNS trigger AS $$
BEGIN
  IF OLD."consultation_id" IS NOT NULL AND OLD."workflow_status" <> 'DRAFT' AND (
       NEW."diagnosis" IS DISTINCT FROM OLD."diagnosis" OR NEW."investigations" IS DISTINCT FROM OLD."investigations"
    OR NEW."advice" IS DISTINCT FROM OLD."advice" OR NEW."follow_up" IS DISTINCT FROM OLD."follow_up"
    OR NEW."notes" IS DISTINCT FROM OLD."notes" OR NEW."free_text" IS DISTINCT FROM OLD."free_text"
    OR NEW."red_flags" IS DISTINCT FROM OLD."red_flags" OR NEW."follow_up_interval" IS DISTINCT FROM OLD."follow_up_interval"
    OR NEW."vitals" IS DISTINCT FROM OLD."vitals" OR NEW."rx_number" IS DISTINCT FROM OLD."rx_number"
    OR NEW."revision" IS DISTINCT FROM OLD."revision" OR NEW."consultation_id" IS DISTINCT FROM OLD."consultation_id"
    OR NEW."prescribed_by" IS DISTINCT FROM OLD."prescribed_by" OR NEW."finalized_at" IS DISTINCT FROM OLD."finalized_at"
    OR (OLD."workflow_status" = 'SUPERSEDED' AND NEW."workflow_status" <> 'SUPERSEDED')
    OR (OLD."workflow_status" = 'FINALIZED' AND NEW."workflow_status" NOT IN ('FINALIZED', 'SUPERSEDED'))
  ) THEN
    RAISE EXCEPTION 'finalized prescription % is locked', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "prescriptions_lock_trg" ON "prescriptions";
--> statement-breakpoint
CREATE TRIGGER "prescriptions_lock_trg" BEFORE UPDATE ON "prescriptions" FOR EACH ROW EXECUTE FUNCTION etabib_prescription_lock();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION etabib_prescription_items_lock() RETURNS trigger AS $$
DECLARE parent RECORD;
BEGIN
  SELECT "consultation_id", "workflow_status" INTO parent FROM "prescriptions" WHERE "id" = coalesce(NEW."prescription_id", OLD."prescription_id");
  IF parent."consultation_id" IS NOT NULL AND parent."workflow_status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'items of a finalized prescription are locked' USING ERRCODE = 'check_violation';
  END IF;
  RETURN coalesce(NEW, OLD);
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "prescription_items_lock_trg" ON "prescription_items";
--> statement-breakpoint
CREATE TRIGGER "prescription_items_lock_trg" BEFORE INSERT OR UPDATE OR DELETE ON "prescription_items" FOR EACH ROW EXECUTE FUNCTION etabib_prescription_items_lock();
