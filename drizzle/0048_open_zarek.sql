ALTER TABLE "operations_content_schedule" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "operations_content_schedule" ADD COLUMN "execution_history" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "operations_monthly_plan" ADD COLUMN "arrangement_status" text DEFAULT 'editing' NOT NULL;--> statement-breakpoint
ALTER TABLE "operations_monthly_plan" ADD COLUMN "arrangement_history" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "operations_monthly_plan" ADD COLUMN "arrangement_submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "operations_monthly_plan" ADD COLUMN "sealed_version_id" uuid;--> statement-breakpoint
ALTER TABLE "operations_monthly_plan" ADD CONSTRAINT "operations_monthly_plan_sealed_version_id_operations_review_meeting_version_id_fk" FOREIGN KEY ("sealed_version_id") REFERENCES "public"."operations_review_meeting_version"("id") ON DELETE restrict ON UPDATE no action;