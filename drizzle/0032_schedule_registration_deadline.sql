-- 已完成排期保留原门槛；仅未登记及后续新排期使用 2 小时。
ALTER TABLE "operations_content_schedule" ADD COLUMN "delay_threshold_hours" integer DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE "operations_schedule_plan_history" ADD COLUMN "delay_threshold_hours" integer DEFAULT 8 NOT NULL;--> statement-breakpoint
UPDATE "operations_content_schedule" SET "delay_threshold_hours" = 2 WHERE "actual_publish_at" IS NULL;--> statement-breakpoint
ALTER TABLE "operations_content_schedule" ALTER COLUMN "delay_threshold_hours" SET DEFAULT 2;--> statement-breakpoint
ALTER TABLE "operations_schedule_plan_history" ALTER COLUMN "delay_threshold_hours" SET DEFAULT 2;
