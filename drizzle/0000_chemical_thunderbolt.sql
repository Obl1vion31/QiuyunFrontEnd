CREATE TABLE "operations_content_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_name" text NOT NULL,
	"content_type" text NOT NULL,
	"is_promoted" boolean DEFAULT false NOT NULL,
	"sync_to_moments" boolean DEFAULT false NOT NULL,
	"current_stage" text NOT NULL,
	"project_doc_name" text,
	"project_doc_url" text,
	"planned_publish_date" date NOT NULL,
	"actual_publish_date" date,
	"completion_status" text NOT NULL,
	"delay_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "operations_schedule_planned_date_idx" ON "operations_content_schedule" USING btree ("planned_publish_date");--> statement-breakpoint
CREATE INDEX "operations_schedule_stage_idx" ON "operations_content_schedule" USING btree ("current_stage");--> statement-breakpoint
CREATE INDEX "operations_schedule_completion_idx" ON "operations_content_schedule" USING btree ("completion_status");--> statement-breakpoint
CREATE INDEX "operations_schedule_promoted_idx" ON "operations_content_schedule" USING btree ("is_promoted");