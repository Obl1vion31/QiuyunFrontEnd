CREATE TABLE "operations_promotion_day_decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"stage_type" text NOT NULL,
	CONSTRAINT "operations_promotion_day_decision_stage_check" CHECK ("operations_promotion_day_decision"."stage_type" IN ('testing','scaling'))
);
--> statement-breakpoint
CREATE TABLE "operations_promotion_start_plan" (
	"schedule_id" uuid PRIMARY KEY NOT NULL,
	"waiting_through" date,
	"planned_on" date,
	"planned_stage" text,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operations_promotion_start_plan_pair_check" CHECK (("operations_promotion_start_plan"."planned_on" IS NULL) = ("operations_promotion_start_plan"."planned_stage" IS NULL) AND ("operations_promotion_start_plan"."planned_stage" IS NULL OR "operations_promotion_start_plan"."planned_stage" IN ('testing','scaling')) AND ("operations_promotion_start_plan"."planned_on" IS NULL OR "operations_promotion_start_plan"."waiting_through" IS NULL OR "operations_promotion_start_plan"."planned_on" > "operations_promotion_start_plan"."waiting_through"))
);
--> statement-breakpoint
CREATE TABLE "operations_promotion_timeline_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"business_date" date NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"changed_by_id" text NOT NULL,
	"changed_by_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operations_promotion_timeline_audit_request_key_unique" UNIQUE("request_key")
);
--> statement-breakpoint
ALTER TABLE "operations_promotion_day_decision" ADD CONSTRAINT "operations_promotion_day_decision_campaign_id_operations_promotion_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."operations_promotion_campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_promotion_start_plan" ADD CONSTRAINT "operations_promotion_start_plan_schedule_id_operations_content_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."operations_content_schedule"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_promotion_timeline_audit" ADD CONSTRAINT "operations_promotion_timeline_audit_schedule_id_operations_content_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."operations_content_schedule"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "operations_promotion_day_decision_date_idx" ON "operations_promotion_day_decision" USING btree ("campaign_id","business_date");--> statement-breakpoint
CREATE INDEX "operations_promotion_timeline_schedule_idx" ON "operations_promotion_timeline_audit" USING btree ("schedule_id","created_at");
--> statement-breakpoint
INSERT INTO operations_promotion_start_plan (schedule_id, waiting_through)
SELECT id, promotion_deferred_through FROM operations_content_schedule
WHERE promotion_status = 'awaiting_promotion' AND actual_publish_at IS NOT NULL
  AND promotion_deferred_through >= (actual_publish_at AT TIME ZONE 'Asia/Shanghai')::date
ON CONFLICT (schedule_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO operations_promotion_timeline_audit (schedule_id, request_key, business_date, action, reason, before, after, changed_by_id, changed_by_label)
SELECT p.schedule_id, gen_random_uuid(), p.waiting_through, 'legacy_defer', '迁移旧未推广确认，原记录未保存逐次操作时间',
 jsonb_build_object('promotionDeferredThrough', p.waiting_through), jsonb_build_object('waitingThrough', p.waiting_through, 'legacySource', true), 'migration:promotion-timeline', '历史记录迁移'
FROM operations_promotion_start_plan p WHERE p.waiting_through IS NOT NULL;
--> statement-breakpoint
INSERT INTO operations_category_policy_version (category_id,version_number,display_name,default_is_promoted,is_selectable,requires_non_promotion_review,effective_on,change_summary,changed_by_label)
SELECT 'first-analysis-series',COALESCE(MAX(version_number),0)+1,
 COALESCE((array_agg(display_name ORDER BY version_number DESC))[1],'第一时间解析帖集'),
 COALESCE((array_agg(default_is_promoted ORDER BY version_number DESC))[1],false),
 COALESCE((array_agg(is_selectable ORDER BY version_number DESC))[1],true),true,DATE '2026-10-14',
 '恢复第一时间解析帖正常复盘，单篇例外通过不复盘记录管理','migration:promotion-timeline'
FROM operations_category_policy_version WHERE category_id='first-analysis-series';
--> statement-breakpoint
INSERT INTO operations_non_promotion_checkpoint_event (schedule_id,checkpoint_type,action,reason,changed_by_id,changed_by_label)
SELECT sc.id,cp.checkpoint_type,'skip','历史第一时间解析帖不纳入本次复盘','migration:promotion-timeline','历史规则迁移'
FROM operations_content_schedule sc JOIN operations_content_version v ON v.id=sc.content_version_id
CROSS JOIN (VALUES ('day_7'),('day_15')) AS cp(checkpoint_type)
WHERE v.category_id='first-analysis-series' AND sc.is_promoted=false
 AND sc.actual_publish_at < TIMESTAMPTZ '2026-10-14 00:00:00+08'
 AND NOT EXISTS (SELECT 1 FROM operations_non_promotion_review r WHERE r.schedule_id=sc.id AND r.checkpoint_type=cp.checkpoint_type)
 AND NOT EXISTS (SELECT 1 FROM operations_content_performance_metric m WHERE m.schedule_id=sc.id AND m.checkpoint_type=cp.checkpoint_type)
 AND NOT EXISTS (SELECT 1 FROM operations_non_promotion_checkpoint_event e WHERE e.schedule_id=sc.id AND e.checkpoint_type=cp.checkpoint_type);
