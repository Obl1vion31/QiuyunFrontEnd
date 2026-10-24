CREATE TABLE "operations_non_promotion_checkpoint_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence" bigint GENERATED ALWAYS AS IDENTITY (sequence name "operations_non_promotion_checkpoint_event_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"schedule_id" uuid NOT NULL,
	"checkpoint_type" text NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"changed_by_id" text NOT NULL,
	"changed_by_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operations_checkpoint_event_type_check" CHECK ("operations_non_promotion_checkpoint_event"."checkpoint_type" IN ('day_7','day_15')),
	CONSTRAINT "operations_checkpoint_event_action_check" CHECK ("operations_non_promotion_checkpoint_event"."action" IN ('skip','restore'))
);
--> statement-breakpoint
CREATE TABLE "operations_schedule_change_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"plan_revision" integer NOT NULL,
	"original_planned_publish_at" timestamp with time zone NOT NULL,
	"requested_publish_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by_id" text NOT NULL,
	"requested_by_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_id" text,
	"decided_by_label" text,
	"decision_reason" text,
	"decided_at" timestamp with time zone,
	CONSTRAINT "operations_change_request_status_check" CHECK ("operations_schedule_change_request"."status" IN ('pending','approved','rejected','obsolete'))
);
--> statement-breakpoint
CREATE TABLE "operations_schedule_delay_reason" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"plan_revision" integer NOT NULL,
	"day_number" integer NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"responsibility" text NOT NULL,
	"reason" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"changed_by_id" text,
	"changed_by_label" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "operations_delay_reason_day_check" CHECK ("operations_schedule_delay_reason"."day_number" > 0),
	CONSTRAINT "operations_delay_reason_responsibility_check" CHECK ("operations_schedule_delay_reason"."responsibility" IN ('self','requester','unknown')),
	CONSTRAINT "operations_delay_reason_source_check" CHECK ("operations_schedule_delay_reason"."source" IN ('manual','historical')),
	CONSTRAINT "operations_delay_reason_text_check" CHECK (length(trim("operations_schedule_delay_reason"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "operations_schedule_plan_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"planned_publish_at" timestamp with time zone NOT NULL,
	"effective_at" timestamp with time zone,
	"ended_at" timestamp with time zone NOT NULL,
	"new_planned_publish_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"changed_by_id" text NOT NULL,
	"changed_by_label" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "operations_content_version" DROP CONSTRAINT "operations_content_version_category_required_check";--> statement-breakpoint
ALTER TABLE "operations_content_schedule" ADD COLUMN "plan_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "operations_content_schedule" ADD COLUMN "plan_effective_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "operations_non_promotion_checkpoint_event" ADD CONSTRAINT "operations_non_promotion_checkpoint_event_schedule_id_operations_content_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."operations_content_schedule"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_schedule_change_request" ADD CONSTRAINT "operations_schedule_change_request_schedule_id_operations_content_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."operations_content_schedule"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_schedule_delay_reason" ADD CONSTRAINT "operations_schedule_delay_reason_schedule_id_operations_content_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."operations_content_schedule"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_schedule_plan_history" ADD CONSTRAINT "operations_schedule_plan_history_schedule_id_operations_content_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."operations_content_schedule"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "operations_checkpoint_event_schedule_idx" ON "operations_non_promotion_checkpoint_event" USING btree ("schedule_id","checkpoint_type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "operations_change_request_pending_idx" ON "operations_schedule_change_request" USING btree ("schedule_id") WHERE "operations_schedule_change_request"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "operations_change_request_status_idx" ON "operations_schedule_change_request" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "operations_delay_reason_day_idx" ON "operations_schedule_delay_reason" USING btree ("schedule_id","plan_revision","day_number");--> statement-breakpoint
CREATE UNIQUE INDEX "operations_plan_history_revision_idx" ON "operations_schedule_plan_history" USING btree ("schedule_id","revision");--> statement-breakpoint
ALTER TABLE "operations_content_version" ADD CONSTRAINT "operations_content_version_category_required_check" CHECK (("operations_content_version"."category_id" IS NOT NULL OR "operations_content_version"."subject_id" = 'interview'));
--> statement-breakpoint
INSERT INTO operations_subject (id, name, sort_order) VALUES ('temporary', '临时学科', 999) ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO operations_category (id, name, sort_order) VALUES ('temporary', '临时帖', 999) ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO operations_subject_category (subject_id, category_id)
SELECT id, 'temporary' FROM operations_subject ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE operations_content_version SET category_id = 'temporary' WHERE category_id IS NULL;
--> statement-breakpoint
-- 旧原因只作为明确标注的历史补齐，不猜测责任方；不覆盖已存在的人工记录。
INSERT INTO operations_schedule_delay_reason
  (schedule_id, plan_revision, day_number, due_at, responsibility, reason, source, changed_by_label)
SELECT schedule.id, schedule.plan_revision, day.day_number::integer, day.due_at,
  'unknown', COALESCE(NULLIF(trim(schedule.delay_reason), ''), '未知'), 'historical', '历史补齐'
FROM operations_content_schedule AS schedule
CROSS JOIN LATERAL generate_series(
  GREATEST(schedule.planned_publish_at + interval '8 hours', COALESCE(schedule.plan_effective_at, '-infinity'::timestamptz)),
  COALESCE(schedule.actual_publish_at, now()), interval '24 hours'
) WITH ORDINALITY AS day(due_at, day_number)
ON CONFLICT (schedule_id, plan_revision, day_number) DO NOTHING;
--> statement-breakpoint
UPDATE operations_content_schedule SET completion_status = CASE
  WHEN actual_publish_at IS NULL THEN 'pending'
  WHEN actual_publish_at >= planned_publish_at + interval '8 hours' THEN 'delayed'
  ELSE 'on_time' END;
