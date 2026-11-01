CREATE TABLE "operations_non_promotion_custom_checkpoint" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"due_on" date NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"cancelled_at" timestamp with time zone,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operations_non_promotion_review_plan" (
	"content_id" uuid PRIMARY KEY NOT NULL,
	"anchor_schedule_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"day_7" boolean DEFAULT true NOT NULL,
	"day_15" boolean DEFAULT true NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operations_non_plan_mode_check" CHECK ("operations_non_promotion_review_plan"."mode" IN ('standard','instant','continuous'))
);
--> statement-breakpoint
ALTER TABLE "operations_content_performance_metric" DROP CONSTRAINT "operations_content_metric_checkpoint_check";--> statement-breakpoint
ALTER TABLE "operations_non_promotion_checkpoint_event" DROP CONSTRAINT "operations_checkpoint_event_type_check";--> statement-breakpoint
ALTER TABLE "operations_non_promotion_review" DROP CONSTRAINT "operations_non_promotion_review_checkpoint_check";--> statement-breakpoint
ALTER TABLE "operations_content_performance_metric" ALTER COLUMN "click_rate" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "operations_non_promotion_review" ALTER COLUMN "click_rate_snapshot" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "operations_content_performance_metric" ADD COLUMN "custom_checkpoint_id" uuid;--> statement-breakpoint
ALTER TABLE "operations_content_performance_metric" ADD COLUMN "exposure_count" integer;--> statement-breakpoint
ALTER TABLE "operations_content_performance_metric" ADD COLUMN "read_count" integer;--> statement-breakpoint
ALTER TABLE "operations_non_promotion_checkpoint_event" ADD COLUMN "custom_checkpoint_id" uuid;--> statement-breakpoint
ALTER TABLE "operations_non_promotion_review" ADD COLUMN "custom_checkpoint_id" uuid;--> statement-breakpoint
ALTER TABLE "operations_non_promotion_review" ADD COLUMN "exposure_count_snapshot" integer;--> statement-breakpoint
ALTER TABLE "operations_non_promotion_review" ADD COLUMN "read_count_snapshot" integer;--> statement-breakpoint
ALTER TABLE "operations_non_promotion_custom_checkpoint" ADD CONSTRAINT "operations_non_promotion_custom_checkpoint_content_id_operations_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."operations_content"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_non_promotion_custom_checkpoint" ADD CONSTRAINT "operations_non_promotion_custom_checkpoint_schedule_id_operations_content_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."operations_content_schedule"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_non_promotion_review_plan" ADD CONSTRAINT "operations_non_promotion_review_plan_content_id_operations_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."operations_content"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_non_promotion_review_plan" ADD CONSTRAINT "operations_non_promotion_review_plan_anchor_schedule_id_operations_content_schedule_id_fk" FOREIGN KEY ("anchor_schedule_id") REFERENCES "public"."operations_content_schedule"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "operations_non_custom_content_idx" ON "operations_non_promotion_custom_checkpoint" USING btree ("content_id");--> statement-breakpoint
CREATE UNIQUE INDEX "operations_non_custom_date_idx" ON "operations_non_promotion_custom_checkpoint" USING btree ("content_id","due_on") WHERE "operations_non_promotion_custom_checkpoint"."cancelled_at" IS NULL;--> statement-breakpoint
ALTER TABLE "operations_content_performance_metric" ADD CONSTRAINT "operations_content_performance_metric_custom_checkpoint_id_operations_non_promotion_custom_checkpoint_id_fk" FOREIGN KEY ("custom_checkpoint_id") REFERENCES "public"."operations_non_promotion_custom_checkpoint"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_non_promotion_checkpoint_event" ADD CONSTRAINT "operations_non_promotion_checkpoint_event_custom_checkpoint_id_operations_non_promotion_custom_checkpoint_id_fk" FOREIGN KEY ("custom_checkpoint_id") REFERENCES "public"."operations_non_promotion_custom_checkpoint"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_non_promotion_review" ADD CONSTRAINT "operations_non_promotion_review_custom_checkpoint_id_operations_non_promotion_custom_checkpoint_id_fk" FOREIGN KEY ("custom_checkpoint_id") REFERENCES "public"."operations_non_promotion_custom_checkpoint"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_content_performance_metric" ADD CONSTRAINT "operations_content_metric_counts_check" CHECK (("operations_content_performance_metric"."exposure_count" IS NULL AND "operations_content_performance_metric"."read_count" IS NULL) OR ("operations_content_performance_metric"."exposure_count" IS NOT NULL AND "operations_content_performance_metric"."read_count" IS NOT NULL AND "operations_content_performance_metric"."exposure_count" >= 0 AND "operations_content_performance_metric"."read_count" >= 0 AND "operations_content_performance_metric"."read_count" <= "operations_content_performance_metric"."exposure_count"));--> statement-breakpoint
ALTER TABLE "operations_content_performance_metric" ADD CONSTRAINT "operations_content_metric_checkpoint_check" CHECK (("operations_content_performance_metric"."custom_checkpoint_id" IS NULL AND "operations_content_performance_metric"."checkpoint_type" IN ('day_7','day_15')) OR ("operations_content_performance_metric"."custom_checkpoint_id" IS NOT NULL AND "operations_content_performance_metric"."checkpoint_type" = 'custom:' || "operations_content_performance_metric"."custom_checkpoint_id"::text));--> statement-breakpoint
ALTER TABLE "operations_non_promotion_checkpoint_event" ADD CONSTRAINT "operations_checkpoint_event_type_check" CHECK (("operations_non_promotion_checkpoint_event"."custom_checkpoint_id" IS NULL AND "operations_non_promotion_checkpoint_event"."checkpoint_type" IN ('day_7','day_15')) OR ("operations_non_promotion_checkpoint_event"."custom_checkpoint_id" IS NOT NULL AND "operations_non_promotion_checkpoint_event"."checkpoint_type" = 'custom:' || "operations_non_promotion_checkpoint_event"."custom_checkpoint_id"::text));--> statement-breakpoint
ALTER TABLE "operations_non_promotion_review" ADD CONSTRAINT "operations_non_promotion_review_checkpoint_check" CHECK (("operations_non_promotion_review"."custom_checkpoint_id" IS NULL AND "operations_non_promotion_review"."checkpoint_type" IN ('day_7','day_15')) OR ("operations_non_promotion_review"."custom_checkpoint_id" IS NOT NULL AND "operations_non_promotion_review"."checkpoint_type" = 'custom:' || "operations_non_promotion_review"."custom_checkpoint_id"::text));