CREATE TABLE "operations_stage_review_meeting" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "meeting_at" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "created_by_label" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "operations_stage_review_meeting_range_check" CHECK ("operations_stage_review_meeting"."period_end" >= "operations_stage_review_meeting"."period_start"),
  CONSTRAINT "operations_stage_review_meeting_status_check" CHECK ("operations_stage_review_meeting"."status" IN ('draft', 'completed'))
);
--> statement-breakpoint
CREATE TABLE "operations_content_performance_metric" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "schedule_id" uuid NOT NULL,
  "checkpoint_type" text NOT NULL,
  "recorded_through" date NOT NULL,
  "click_numerator" integer NOT NULL,
  "click_denominator" integer NOT NULL,
  "three_second_read_numerator" integer NOT NULL,
  "three_second_read_denominator" integer NOT NULL,
  "source_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "operations_content_metric_checkpoint_check" CHECK ("operations_content_performance_metric"."checkpoint_type" IN ('day_7', 'day_15', 'day_30')),
  CONSTRAINT "operations_content_metric_click_check" CHECK ("operations_content_performance_metric"."click_numerator" >= 0 AND "operations_content_performance_metric"."click_denominator" > 0 AND "operations_content_performance_metric"."click_numerator" <= "operations_content_performance_metric"."click_denominator"),
  CONSTRAINT "operations_content_metric_read_check" CHECK ("operations_content_performance_metric"."three_second_read_numerator" >= 0 AND "operations_content_performance_metric"."three_second_read_denominator" > 0 AND "operations_content_performance_metric"."three_second_read_numerator" <= "operations_content_performance_metric"."three_second_read_denominator")
);
--> statement-breakpoint
CREATE TABLE "operations_non_promotion_review" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "schedule_id" uuid NOT NULL,
  "metric_id" uuid NOT NULL,
  "checkpoint_type" text NOT NULL,
  "actual_publish_at_snapshot" timestamp with time zone NOT NULL,
  "subject_id_snapshot" text NOT NULL,
  "subject_name_snapshot" text NOT NULL,
  "category_id_snapshot" text,
  "category_name_snapshot" text,
  "content_name_snapshot" text NOT NULL,
  "click_rate_snapshot" numeric(7, 4) NOT NULL,
  "three_second_read_rate_snapshot" numeric(7, 4) NOT NULL,
  "cohort_snapshot" jsonb NOT NULL,
  "conclusion" text NOT NULL,
  "cause" text,
  "next_action" text,
  "reviewed_by_label" text NOT NULL,
  "reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "operations_non_promotion_review_checkpoint_check" CHECK ("operations_non_promotion_review"."checkpoint_type" IN ('day_7', 'day_15', 'day_30'))
);
--> statement-breakpoint
CREATE TABLE "operations_schedule_usage_event" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "schedule_id" uuid NOT NULL,
  "from_usage" text NOT NULL,
  "to_usage" text NOT NULL,
  "effective_on" date NOT NULL,
  "reason" text NOT NULL,
  "changed_by_label" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "operations_schedule_usage_event_usage_check" CHECK ("operations_schedule_usage_event"."from_usage" IN ('promotion', 'non_promotion') AND "operations_schedule_usage_event"."to_usage" IN ('promotion', 'non_promotion') AND "operations_schedule_usage_event"."from_usage" <> "operations_schedule_usage_event"."to_usage")
);
--> statement-breakpoint
CREATE TABLE "operations_category_policy_version" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "category_id" text NOT NULL,
  "version_number" integer NOT NULL,
  "display_name" text NOT NULL,
  "default_is_promoted" boolean DEFAULT false NOT NULL,
  "is_selectable" boolean DEFAULT true NOT NULL,
  "effective_on" date NOT NULL,
  "change_summary" text NOT NULL,
  "changed_by_label" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "operations_category_policy_version_check" CHECK ("operations_category_policy_version"."version_number" >= 1)
);
--> statement-breakpoint
ALTER TABLE "operations_content_performance_metric" ADD CONSTRAINT "operations_content_performance_metric_schedule_id_operations_content_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."operations_content_schedule"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "operations_non_promotion_review" ADD CONSTRAINT "operations_non_promotion_review_schedule_id_operations_content_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."operations_content_schedule"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "operations_non_promotion_review" ADD CONSTRAINT "operations_non_promotion_review_metric_id_operations_content_performance_metric_id_fk" FOREIGN KEY ("metric_id") REFERENCES "public"."operations_content_performance_metric"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "operations_schedule_usage_event" ADD CONSTRAINT "operations_schedule_usage_event_schedule_id_operations_content_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."operations_content_schedule"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "operations_category_policy_version" ADD CONSTRAINT "operations_category_policy_version_category_id_operations_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."operations_category"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "operations_stage_review_meeting_at_idx" ON "operations_stage_review_meeting" USING btree ("meeting_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "operations_content_metric_schedule_checkpoint_idx" ON "operations_content_performance_metric" USING btree ("schedule_id","checkpoint_type");
--> statement-breakpoint
CREATE INDEX "operations_content_metric_checkpoint_idx" ON "operations_content_performance_metric" USING btree ("checkpoint_type");
--> statement-breakpoint
CREATE UNIQUE INDEX "operations_non_promotion_review_checkpoint_idx" ON "operations_non_promotion_review" USING btree ("schedule_id","checkpoint_type");
--> statement-breakpoint
CREATE INDEX "operations_non_promotion_review_reviewed_idx" ON "operations_non_promotion_review" USING btree ("reviewed_at");
--> statement-breakpoint
CREATE INDEX "operations_schedule_usage_event_schedule_idx" ON "operations_schedule_usage_event" USING btree ("schedule_id","effective_on");
--> statement-breakpoint
CREATE UNIQUE INDEX "operations_category_policy_version_idx" ON "operations_category_policy_version" USING btree ("category_id","version_number");
--> statement-breakpoint
CREATE INDEX "operations_category_policy_effective_idx" ON "operations_category_policy_version" USING btree ("category_id","effective_on");
