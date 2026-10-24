ALTER TABLE "operations_promotion_daily_metric" ADD COLUMN "daily_status" text NOT NULL DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE "operations_content_schedule" DROP CONSTRAINT "operations_schedule_promotion_consistency_check";
--> statement-breakpoint
ALTER TABLE "operations_promotion_campaign" DROP CONSTRAINT "operations_promotion_campaign_status_check";
--> statement-breakpoint
ALTER TABLE "operations_promotion_campaign" DROP CONSTRAINT "operations_promotion_campaign_stage_check";
--> statement-breakpoint
ALTER TABLE "operations_promotion_stage" DROP CONSTRAINT "operations_promotion_stage_outcome_check";
--> statement-breakpoint
ALTER TABLE "operations_promotion_daily_metric" DROP CONSTRAINT "operations_promotion_daily_decision_check";
--> statement-breakpoint
ALTER TABLE "operations_content_schedule" ADD CONSTRAINT "operations_schedule_promotion_consistency_check" CHECK (
  ("is_promoted" = false AND "promotion_status" = 'none')
  OR
  ("is_promoted" = true AND "promotion_status" IN (
    'pending', 'awaiting_promotion', 'testing', 'scaling', 'waiting_action', 'ended', 'test_discarded', 'formal_discarded'
  ))
);
--> statement-breakpoint
ALTER TABLE "operations_promotion_campaign" ADD CONSTRAINT "operations_promotion_campaign_status_check" CHECK (
  "current_status" IN ('testing', 'scaling', 'waiting_action', 'ended', 'test_discarded', 'formal_discarded')
);
--> statement-breakpoint
ALTER TABLE "operations_promotion_campaign" ADD CONSTRAINT "operations_promotion_campaign_stage_check" CHECK (
  ("current_status" = 'testing' AND "current_stage" = 'testing')
  OR ("current_status" = 'scaling' AND "current_stage" = 'scaling')
  OR ("current_status" = 'waiting_action' AND "current_stage" IN ('testing', 'scaling'))
  OR ("current_status" IN ('ended', 'test_discarded', 'formal_discarded') AND "current_stage" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "operations_promotion_stage" ADD CONSTRAINT "operations_promotion_stage_outcome_check" CHECK (
  "outcome" IS NULL OR "outcome" IN ('continued', 'paused', 'start_scaling', 'test_discarded', 'scaling_continued', 'ended', 'formal_discarded')
);
--> statement-breakpoint
ALTER TABLE "operations_promotion_daily_metric" ADD CONSTRAINT "operations_promotion_daily_status_check" CHECK (
  "daily_status" IN ('active', 'waiting_action')
);
--> statement-breakpoint
ALTER TABLE "operations_promotion_daily_metric" ADD CONSTRAINT "operations_promotion_daily_decision_check" CHECK (
  ("daily_status" = 'active' AND "stage_type_snapshot" = 'testing' AND "review_decision" IN ('test_continue', 'test_discarded', 'start_scaling'))
  OR ("daily_status" = 'active' AND "stage_type_snapshot" = 'scaling' AND "review_decision" IN ('scaling_continue', 'formal_discarded', 'ended'))
  OR ("daily_status" = 'waiting_action' AND "stage_type_snapshot" = 'testing' AND "review_decision" IN ('wait_continue', 'test_discarded'))
  OR ("daily_status" = 'waiting_action' AND "stage_type_snapshot" = 'scaling' AND "review_decision" IN ('wait_continue', 'formal_discarded', 'ended'))
);
--> statement-breakpoint
ALTER TABLE "operations_promotion_daily_metric" ADD CONSTRAINT "operations_promotion_daily_waiting_zero_check" CHECK (
  "daily_status" <> 'waiting_action' OR (
    "spend" = 0
    AND "platform_open_count" = 0
    AND "actual_open_count" = 0
    AND "platform_lead_count" = 0
    AND "actual_lead_count" = 0
  )
);
