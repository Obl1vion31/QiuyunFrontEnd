CREATE TABLE "operations_monthly_cost_mapping" (
	"id" text PRIMARY KEY NOT NULL,
	"entries" jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operations_monthly_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" text NOT NULL,
	"meeting_id" uuid NOT NULL,
	"content" jsonb DEFAULT '{"groups":[],"items":[]}'::jsonb NOT NULL,
	"additions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"source_version_id" uuid,
	"first_finalized_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"locked_by_version_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operations_monthly_plan_month_unique" UNIQUE("month")
);
--> statement-breakpoint
CREATE TABLE "operations_monthly_plan_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"schedule_id" uuid,
	"proposal_id" uuid,
	"first_submitted_at" timestamp with time zone,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operations_monthly_private" (
	"month" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "operations_monthly_plan" ADD CONSTRAINT "operations_monthly_plan_meeting_id_operations_review_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."operations_review_meeting"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_monthly_plan" ADD CONSTRAINT "operations_monthly_plan_source_version_id_operations_review_meeting_version_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."operations_review_meeting_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_monthly_plan" ADD CONSTRAINT "operations_monthly_plan_locked_by_version_id_operations_review_meeting_version_id_fk" FOREIGN KEY ("locked_by_version_id") REFERENCES "public"."operations_review_meeting_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_monthly_plan_assignment" ADD CONSTRAINT "operations_monthly_plan_assignment_plan_id_operations_monthly_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."operations_monthly_plan"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_monthly_plan_assignment" ADD CONSTRAINT "operations_monthly_plan_assignment_schedule_id_operations_content_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."operations_content_schedule"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_monthly_plan_assignment" ADD CONSTRAINT "operations_monthly_plan_assignment_proposal_id_operations_change_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."operations_change_proposal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "operations_monthly_plan_item_assignment_idx" ON "operations_monthly_plan_assignment" USING btree ("plan_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "operations_monthly_plan_schedule_assignment_idx" ON "operations_monthly_plan_assignment" USING btree ("plan_id","schedule_id");