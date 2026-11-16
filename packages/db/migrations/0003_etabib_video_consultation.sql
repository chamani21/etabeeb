DO $$ BEGIN
 CREATE TYPE "public"."video_session_status" AS ENUM('CREATED', 'OPEN', 'IN_PROGRESS', 'ENDED', 'EXPIRED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "consultation_join_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" text DEFAULT 'PATIENT' NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "consultation_video_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consultation_id" uuid NOT NULL,
	"room_name" text NOT NULL,
	"status" "video_session_status" DEFAULT 'CREATED' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"opened_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"patient_joined_at" timestamp with time zone,
	"doctor_joined_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "status_updated_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "consultation_join_tokens" ADD CONSTRAINT "consultation_join_tokens_session_id_consultation_video_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."consultation_video_sessions"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "consultation_video_sessions" ADD CONSTRAINT "consultation_video_sessions_consultation_id_consultation_cases_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultation_cases"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "consultation_join_tokens_hash_uq" ON "consultation_join_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consultation_join_tokens_session_idx" ON "consultation_join_tokens" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "consultation_video_sessions_case_uq" ON "consultation_video_sessions" USING btree ("consultation_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "consultation_video_sessions_room_uq" ON "consultation_video_sessions" USING btree ("room_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_provider_message_idx" ON "notification_outbox" USING btree ("provider_message_id");--> statement-breakpoint
-- ---- Hand-added: join tokens are patient-scoped only (doctor joins via the authenticated dashboard) ----
DO $$ BEGIN
 ALTER TABLE "consultation_join_tokens" ADD CONSTRAINT "consultation_join_tokens_role_check" CHECK (role = 'PATIENT');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
