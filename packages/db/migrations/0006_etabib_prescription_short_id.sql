ALTER TABLE "prescriptions" ADD COLUMN "rx_code" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prescriptions_rx_code_revision_uq" ON "prescriptions" USING btree ("rx_code","revision");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prescriptions_rx_code_idx" ON "prescriptions" USING btree ("rx_code");
--> statement-breakpoint
-- ---- Hand-added: short code generator (5 chars, unambiguous alphabet, ≥1 letter and ≥1 digit) ----
CREATE OR REPLACE FUNCTION etabib_new_rx_code() RETURNS text AS $$
DECLARE
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  code text;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..5 LOOP
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    IF code ~ '[A-Z]' AND code ~ '[0-9]' AND NOT EXISTS (SELECT 1 FROM "prescriptions" WHERE "rx_code" = code) THEN
      RETURN code;
    END IF;
  END LOOP;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
-- ---- Backfill: one code per eTabib prescription (all revisions of an rx_number share it) ----
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT "rx_number" FROM "prescriptions" WHERE "consultation_id" IS NOT NULL AND "rx_number" IS NOT NULL AND "rx_code" IS NULL LOOP
    UPDATE "prescriptions" SET "rx_code" = etabib_new_rx_code() WHERE "rx_number" = r."rx_number" AND "rx_code" IS NULL;
  END LOOP;
END $$;
--> statement-breakpoint
-- ---- The code is part of the locked record once finalized ----
CREATE OR REPLACE FUNCTION etabib_prescription_lock() RETURNS trigger AS $$
BEGIN
  IF OLD."consultation_id" IS NOT NULL AND OLD."workflow_status" <> 'DRAFT' AND (
       NEW."diagnosis" IS DISTINCT FROM OLD."diagnosis" OR NEW."investigations" IS DISTINCT FROM OLD."investigations"
    OR NEW."advice" IS DISTINCT FROM OLD."advice" OR NEW."follow_up" IS DISTINCT FROM OLD."follow_up"
    OR NEW."notes" IS DISTINCT FROM OLD."notes" OR NEW."free_text" IS DISTINCT FROM OLD."free_text"
    OR NEW."red_flags" IS DISTINCT FROM OLD."red_flags" OR NEW."follow_up_interval" IS DISTINCT FROM OLD."follow_up_interval"
    OR NEW."vitals" IS DISTINCT FROM OLD."vitals" OR NEW."rx_number" IS DISTINCT FROM OLD."rx_number"
    OR (OLD."rx_code" IS NOT NULL AND NEW."rx_code" IS DISTINCT FROM OLD."rx_code")
    OR NEW."revision" IS DISTINCT FROM OLD."revision" OR NEW."consultation_id" IS DISTINCT FROM OLD."consultation_id"
    OR NEW."prescribed_by" IS DISTINCT FROM OLD."prescribed_by" OR NEW."finalized_at" IS DISTINCT FROM OLD."finalized_at"
    OR (OLD."workflow_status" = 'SUPERSEDED' AND NEW."workflow_status" <> 'SUPERSEDED')
    OR (OLD."workflow_status" = 'FINALIZED' AND NEW."workflow_status" NOT IN ('FINALIZED', 'SUPERSEDED'))
  ) THEN
    RAISE EXCEPTION 'finalized prescription % is locked', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
