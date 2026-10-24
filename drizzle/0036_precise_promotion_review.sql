ALTER TABLE "operations_content_schedule" DROP CONSTRAINT "operations_schedule_promotion_consistency_check";--> statement-breakpoint
ALTER TABLE "operations_promotion_campaign" DROP CONSTRAINT "operations_promotion_campaign_status_check";--> statement-breakpoint
ALTER TABLE "operations_promotion_campaign" DROP CONSTRAINT "operations_promotion_campaign_stage_check";--> statement-breakpoint
ALTER TABLE "operations_promotion_daily_metric" DROP CONSTRAINT "operations_promotion_daily_waiting_zero_check";--> statement-breakpoint
ALTER TABLE "operations_promotion_daily_metric" DROP CONSTRAINT "operations_promotion_daily_decision_check";--> statement-breakpoint
ALTER TABLE "operations_promotion_campaign" ADD COLUMN "daily_review_enabled_on" date DEFAULT (now() AT TIME ZONE 'Asia/Shanghai')::date NOT NULL;--> statement-breakpoint
ALTER TABLE "operations_promotion_daily_metric" ADD COLUMN "actual_status_snapshot" text;--> statement-breakpoint
ALTER TABLE "operations_promotion_daily_metric" ADD COLUMN "record_kind" text DEFAULT 'regular' NOT NULL;--> statement-breakpoint
ALTER TABLE "operations_promotion_daily_metric" ADD COLUMN "source_stage_started_on" date;--> statement-breakpoint
ALTER TABLE "operations_promotion_day_decision" ADD COLUMN "actual_status" text;--> statement-breakpoint
ALTER TABLE "operations_promotion_day_decision" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "operations_content_schedule" ADD CONSTRAINT "operations_schedule_promotion_consistency_check" CHECK ((
        ("operations_content_schedule"."is_promoted" = false AND "operations_content_schedule"."promotion_status" = 'none')
        OR
        ("operations_content_schedule"."is_promoted" = true AND "operations_content_schedule"."promotion_status" IN (
          'pending', 'awaiting_promotion', 'testing', 'test_paused', 'test_pending', 'scaling', 'scaling_paused', 'waiting_action', 'ended', 'test_discarded', 'formal_discarded'
        ))
      ));--> statement-breakpoint
ALTER TABLE "operations_promotion_campaign" ADD CONSTRAINT "operations_promotion_campaign_status_check" CHECK ("operations_promotion_campaign"."current_status" IN ('testing', 'test_paused', 'test_pending', 'scaling', 'scaling_paused', 'waiting_action', 'ended', 'test_discarded', 'formal_discarded'));--> statement-breakpoint
ALTER TABLE "operations_promotion_campaign" ADD CONSTRAINT "operations_promotion_campaign_stage_check" CHECK ((
        ("operations_promotion_campaign"."current_status" IN ('testing','test_paused','test_pending') AND "operations_promotion_campaign"."current_stage" = 'testing')
        OR ("operations_promotion_campaign"."current_status" IN ('scaling','scaling_paused') AND "operations_promotion_campaign"."current_stage" = 'scaling')
        OR ("operations_promotion_campaign"."current_status" = 'waiting_action' AND "operations_promotion_campaign"."current_stage" IN ('testing', 'scaling'))
        OR ("operations_promotion_campaign"."current_status" IN ('ended', 'test_discarded', 'formal_discarded') AND "operations_promotion_campaign"."current_stage" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "operations_promotion_daily_metric" ADD CONSTRAINT "operations_promotion_daily_kind_check" CHECK ("operations_promotion_daily_metric"."record_kind" IN ('regular','test_residual') AND ("operations_promotion_daily_metric"."record_kind" <> 'test_residual' OR ("operations_promotion_daily_metric"."stage_type_snapshot"='testing' AND "operations_promotion_daily_metric"."source_stage_started_on" IS NOT NULL AND "operations_promotion_daily_metric"."review_decision"='test_discarded')));--> statement-breakpoint
ALTER TABLE "operations_promotion_daily_metric" ADD CONSTRAINT "operations_promotion_daily_actual_status_check" CHECK ("operations_promotion_daily_metric"."actual_status_snapshot" IS NULL OR "operations_promotion_daily_metric"."actual_status_snapshot" IN ('testing','test_paused','test_pending','scaling','scaling_paused','test_discarded','formal_discarded','ended'));--> statement-breakpoint
ALTER TABLE "operations_promotion_daily_metric" ADD CONSTRAINT "operations_promotion_daily_decision_check" CHECK ("operations_promotion_daily_metric"."review_decision" IN ('test_continue','wait_continue','test_discarded','start_scaling','scaling_continue','formal_discarded','ended','test_pause','test_pending','scaling_pause'));