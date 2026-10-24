ALTER TABLE "operations_stage_review_meeting" RENAME TO "operations_review_meeting";
--> statement-breakpoint
ALTER INDEX "operations_stage_review_meeting_at_idx" RENAME TO "operations_review_meeting_at_idx";
--> statement-breakpoint
ALTER TABLE "operations_review_meeting" RENAME CONSTRAINT "operations_stage_review_meeting_range_check" TO "operations_review_meeting_range_check";
--> statement-breakpoint
ALTER TABLE "operations_review_meeting" RENAME CONSTRAINT "operations_stage_review_meeting_status_check" TO "operations_review_meeting_status_check";
--> statement-breakpoint
ALTER TABLE "operations_review_meeting" ADD COLUMN "meeting_type" text NOT NULL DEFAULT 'weekly';
--> statement-breakpoint
ALTER TABLE "operations_review_meeting" ADD COLUMN "current_version_number" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "operations_review_meeting" ADD COLUMN "draft_snapshot" jsonb NOT NULL DEFAULT '{"schemaVersion":1,"coreConclusion":"","nextAction":"","promotionInputs":{},"issues":[]}'::jsonb;
--> statement-breakpoint
ALTER TABLE "operations_review_meeting" ADD COLUMN "finalized_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "operations_review_meeting" ADD CONSTRAINT "operations_review_meeting_type_check" CHECK ("meeting_type" IN ('weekly', 'monthly'));
--> statement-breakpoint
ALTER TABLE "operations_review_meeting" ADD CONSTRAINT "operations_review_meeting_version_check" CHECK ("current_version_number" >= 0);
--> statement-breakpoint
CREATE TABLE "operations_review_meeting_version" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "meeting_id" uuid NOT NULL REFERENCES "operations_review_meeting"("id") ON DELETE RESTRICT,
  "version_number" integer NOT NULL,
  "snapshot" jsonb NOT NULL,
  "change_summary" text NOT NULL,
  "finalized_by_label" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "operations_review_meeting_version_number_check" CHECK ("version_number" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "operations_review_meeting_version_idx" ON "operations_review_meeting_version" ("meeting_id", "version_number");
--> statement-breakpoint
INSERT INTO "operations_review_meeting_version" ("meeting_id", "version_number", "snapshot", "change_summary", "finalized_by_label", "created_at")
SELECT "id", 0,
  jsonb_build_object(
    'schemaVersion', 1,
    'legacy', true,
    'meeting', jsonb_build_object('name', "name", 'periodStart', "period_start", 'periodEnd', "period_end", 'meetingAt', "meeting_at"),
    'generated', '{}'::jsonb,
    'draft', "draft_snapshot"
  ),
  '迁移已完成的旧例会', "created_by_label", "updated_at"
FROM "operations_review_meeting"
WHERE "status" = 'completed';
--> statement-breakpoint
UPDATE "operations_review_meeting" SET "finalized_at" = "updated_at" WHERE "status" = 'completed';
--> statement-breakpoint
CREATE TABLE "operations_review_action_item" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "problem" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "created_meeting_id" uuid NOT NULL REFERENCES "operations_review_meeting"("id") ON DELETE RESTRICT,
  "resolved_meeting_id" uuid REFERENCES "operations_review_meeting"("id") ON DELETE RESTRICT,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "operations_review_action_status_check" CHECK ("status" IN ('pending', 'validating', 'resolved', 'paused'))
);
--> statement-breakpoint
CREATE INDEX "operations_review_action_status_idx" ON "operations_review_action_item" ("status", "updated_at");
--> statement-breakpoint
CREATE TABLE "operations_review_action_progress" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "item_id" uuid NOT NULL REFERENCES "operations_review_action_item"("id") ON DELETE CASCADE,
  "meeting_id" uuid NOT NULL REFERENCES "operations_review_meeting"("id") ON DELETE RESTRICT,
  "conclusion" text NOT NULL,
  "status_snapshot" text NOT NULL,
  "recorded_by_label" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "operations_review_action_progress_status_check" CHECK ("status_snapshot" IN ('pending', 'validating', 'resolved', 'paused'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "operations_review_action_progress_meeting_idx" ON "operations_review_action_progress" ("item_id", "meeting_id");
