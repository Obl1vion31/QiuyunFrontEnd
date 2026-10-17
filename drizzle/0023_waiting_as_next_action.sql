ALTER TABLE "operations_promotion_daily_metric" DROP CONSTRAINT "operations_promotion_daily_decision_check";
--> statement-breakpoint
ALTER TABLE "operations_promotion_daily_metric" ADD CONSTRAINT "operations_promotion_daily_decision_check" CHECK (
  ("daily_status" = 'active' AND "stage_type_snapshot" = 'testing' AND "review_decision" IN ('test_continue', 'wait_continue', 'test_discarded', 'start_scaling'))
  OR ("daily_status" = 'active' AND "stage_type_snapshot" = 'scaling' AND "review_decision" IN ('scaling_continue', 'wait_continue', 'formal_discarded', 'ended'))
  OR ("daily_status" = 'waiting_action' AND "stage_type_snapshot" = 'testing' AND "review_decision" IN ('wait_continue', 'test_continue', 'test_discarded', 'start_scaling'))
  OR ("daily_status" = 'waiting_action' AND "stage_type_snapshot" = 'scaling' AND "review_decision" IN ('wait_continue', 'scaling_continue', 'formal_discarded', 'ended'))
);
