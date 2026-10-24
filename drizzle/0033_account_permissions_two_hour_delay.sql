CREATE TABLE "operations_account_permission" (
	"user_id" text NOT NULL,
	"operation" text NOT NULL,
	"mode" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operations_account_permission_user_id_operation_pk" PRIMARY KEY("user_id","operation"),
	CONSTRAINT "operations_permission_mode_check" CHECK ("operations_account_permission"."mode" IN ('disabled','direct','review'))
);
--> statement-breakpoint
CREATE TABLE "operations_change_proposal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_by_id" text NOT NULL,
	"requested_by_label" text NOT NULL,
	"module" text NOT NULL,
	"target" text NOT NULL,
	"operations" jsonb NOT NULL,
	"path" text NOT NULL,
	"method" text NOT NULL,
	"content_type" text NOT NULL,
	"body" text NOT NULL,
	"fingerprint" text NOT NULL,
	"request_key" text NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"decision_reason" text,
	"decided_by_id" text,
	"decided_by_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "operations_change_proposal_request_key_unique" UNIQUE("request_key"),
	CONSTRAINT "operations_proposal_status_check" CHECK ("operations_change_proposal"."status" IN ('pending','approved','rejected','obsolete'))
);
--> statement-breakpoint
CREATE TABLE "operations_permission_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"changed_by_id" text NOT NULL,
	"changed_by_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "operations_schedule_delay_reason" DROP CONSTRAINT "operations_delay_reason_responsibility_check";--> statement-breakpoint
ALTER TABLE "operations_account_permission" ADD CONSTRAINT "operations_account_permission_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_change_proposal" ADD CONSTRAINT "operations_change_proposal_requested_by_id_auth_user_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_permission_audit" ADD CONSTRAINT "operations_permission_audit_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "operations_proposal_status_idx" ON "operations_change_proposal" USING btree ("status");--> statement-breakpoint
CREATE INDEX "operations_proposal_owner_idx" ON "operations_change_proposal" USING btree ("requested_by_id");--> statement-breakpoint
ALTER TABLE "operations_schedule_delay_reason" ADD CONSTRAINT "operations_delay_reason_responsibility_check" CHECK ("operations_schedule_delay_reason"."responsibility" IN ('self','external','requester','unknown'));
--> statement-breakpoint
-- 用户确认新旧口径一致；原时间、手填原因、原因历史及冻结快照不回写。
UPDATE operations_content_schedule SET delay_threshold_hours = 2,
  completion_status = CASE WHEN actual_publish_at IS NULL THEN 'pending'
    WHEN actual_publish_at >= planned_publish_at + interval '2 hours' THEN 'delayed' ELSE 'on_time' END;
--> statement-breakpoint
UPDATE operations_schedule_plan_history SET delay_threshold_hours = 2;
--> statement-breakpoint
WITH periods AS (
  SELECT id AS schedule_id, plan_revision AS revision, planned_publish_at, plan_effective_at AS effective_at,
    LEAST(COALESCE(actual_publish_at, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP) AS through_at
  FROM operations_content_schedule
  UNION ALL
  SELECT h.schedule_id, h.revision, h.planned_publish_at, h.effective_at,
    LEAST(h.ended_at, COALESCE(s.actual_publish_at,CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
  FROM operations_schedule_plan_history h JOIN operations_content_schedule s ON s.id = h.schedule_id
), missing_days AS (
  SELECT p.*, GREATEST(planned_publish_at + interval '2 hours', effective_at) AS starts_at
  FROM periods p
)
INSERT INTO operations_schedule_delay_reason (schedule_id, plan_revision, day_number, due_at, responsibility, reason, source, changed_by_label)
SELECT schedule_id, revision, (EXTRACT(EPOCH FROM (due_at-starts_at))/86400)::integer+1,
  due_at, 'unknown', '未知', 'historical', '历史补齐'
FROM missing_days CROSS JOIN LATERAL generate_series(starts_at,through_at,interval '24 hours') AS due_at
ON CONFLICT (schedule_id,plan_revision,day_number) DO NOTHING;
