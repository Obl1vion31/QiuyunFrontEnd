ALTER TABLE "operations_review_meeting_version" ALTER COLUMN "finalized_by_label" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "operations_review_meeting_version" ADD COLUMN "lifecycle_status" text DEFAULT 'finalized' NOT NULL;--> statement-breakpoint
ALTER TABLE "operations_review_meeting_version" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "operations_review_meeting_version" ADD COLUMN "finalized_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "operations_review_meeting_one_draft_idx" ON "operations_review_meeting_version" USING btree ("meeting_id") WHERE "operations_review_meeting_version"."lifecycle_status" = 'draft' AND "operations_review_meeting_version"."invalidated_at" IS NULL;--> statement-breakpoint
ALTER TABLE "operations_review_meeting_version" ADD CONSTRAINT "operations_review_meeting_version_lifecycle_check" CHECK ("operations_review_meeting_version"."lifecycle_status" IN ('draft','finalized'));
--> statement-breakpoint
UPDATE operations_review_meeting_version SET updated_at=created_at, finalized_at=created_at;
--> statement-breakpoint
-- 原始草稿获得自己的 V0；仅使用已保存材料，不读取或重算业务事实。
INSERT INTO operations_review_meeting_version(meeting_id,version_number,lifecycle_status,snapshot,change_summary,created_at,updated_at)
SELECT m.id,0,'draft',jsonb_build_object('schemaVersion',4,'finalizationStage','pre','meeting',jsonb_build_object('name',m.name,'periodStart',m.period_start,'periodEnd',m.period_end),'draft',m.draft_snapshot||'{"workflowVersion":6,"finalizationStage":"pre"}'::jsonb,'generated',jsonb_build_object('summary',coalesce(m.draft_snapshot->'materialSnapshot'->'summary','{}'::jsonb),'promotions','[]'::jsonb,'nonPromotions','[]'::jsonb)), '会前 V0 草稿',m.created_at,m.updated_at
FROM operations_review_meeting m WHERE m.status='draft' AND m.draft_snapshot->>'schemaVersion'='4' AND NOT EXISTS(SELECT 1 FROM operations_review_meeting_version v WHERE v.meeting_id=m.id);
--> statement-breakpoint
-- 旧讨论草稿保留在下一 V 号，生成指标仍来自原定稿版本。
INSERT INTO operations_review_meeting_version(meeting_id,version_number,lifecycle_status,source_version_id,snapshot,change_summary,created_at,updated_at)
SELECT m.id,(SELECT max(n.version_number)+1 FROM operations_review_meeting_version n WHERE n.meeting_id=m.id),'draft',v.id,v.snapshot||jsonb_build_object('draft',m.draft_snapshot||'{"workflowVersion":6}'::jsonb),'迁移的版本草稿',m.updated_at,m.updated_at
FROM operations_review_meeting m JOIN operations_review_meeting_version v ON v.meeting_id=m.id AND v.version_number=m.current_version_number
WHERE m.status='completed' AND m.draft_snapshot->>'hasRevisionDraft'='true' AND v.snapshot->>'schemaVersion'='4';
--> statement-breakpoint
UPDATE operations_review_meeting SET draft_snapshot=draft_snapshot||'{"workflowVersion":6}'::jsonb WHERE draft_snapshot->>'schemaVersion'='4';
