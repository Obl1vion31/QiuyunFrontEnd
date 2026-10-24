CREATE TABLE "operations_promotion_hold" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"started_on" date NOT NULL,
	"ended_on" date NOT NULL,
	"stage_type" text NOT NULL,
	"resume_stage" text NOT NULL,
	"reason" text NOT NULL,
	"source_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operations_promotion_hold_source_key_unique" UNIQUE("source_key"),
	CONSTRAINT "operations_promotion_hold_dates_check" CHECK ("operations_promotion_hold"."ended_on" >= "operations_promotion_hold"."started_on"),
	CONSTRAINT "operations_promotion_hold_stages_check" CHECK ("operations_promotion_hold"."stage_type" IN ('testing','scaling') AND "operations_promotion_hold"."resume_stage" IN ('testing','scaling'))
);
--> statement-breakpoint
CREATE TABLE "operations_promotion_pause" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_key" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"resumed_at" timestamp with time zone,
	"reason" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_by_id" text NOT NULL,
	"created_by_label" text NOT NULL,
	"updated_by_id" text NOT NULL,
	"updated_by_label" text NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operations_promotion_pause_request_key_unique" UNIQUE("request_key"),
	CONSTRAINT "operations_promotion_pause_dates_check" CHECK ("operations_promotion_pause"."ends_at" > "operations_promotion_pause"."starts_at" AND ("operations_promotion_pause"."resumed_at" IS NULL OR "operations_promotion_pause"."resumed_at" >= "operations_promotion_pause"."starts_at"))
);
--> statement-breakpoint
CREATE TABLE "operations_promotion_pause_target" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pause_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"stage_type" text NOT NULL,
	CONSTRAINT "operations_promotion_pause_target_stage_check" CHECK ("operations_promotion_pause_target"."stage_type" IN ('testing','scaling'))
);
--> statement-breakpoint
ALTER TABLE "operations_promotion_campaign" ADD COLUMN "initial_stage" text DEFAULT 'testing' NOT NULL;--> statement-breakpoint
ALTER TABLE "operations_promotion_hold" ADD CONSTRAINT "operations_promotion_hold_campaign_id_operations_promotion_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."operations_promotion_campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_promotion_pause_target" ADD CONSTRAINT "operations_promotion_pause_target_pause_id_operations_promotion_pause_id_fk" FOREIGN KEY ("pause_id") REFERENCES "public"."operations_promotion_pause"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_promotion_pause_target" ADD CONSTRAINT "operations_promotion_pause_target_campaign_id_operations_promotion_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."operations_promotion_campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "operations_promotion_hold_campaign_start_idx" ON "operations_promotion_hold" USING btree ("campaign_id","started_on");--> statement-breakpoint
CREATE UNIQUE INDEX "operations_promotion_pause_target_unique" ON "operations_promotion_pause_target" USING btree ("pause_id","campaign_id");--> statement-breakpoint
ALTER TABLE "operations_promotion_campaign" ADD CONSTRAINT "operations_promotion_initial_stage_check" CHECK ("operations_promotion_campaign"."initial_stage" IN ('testing', 'scaling'));
--> statement-breakpoint
UPDATE operations_promotion_campaign c SET initial_stage = COALESCE((SELECT stage_type FROM operations_promotion_stage s WHERE s.campaign_id = c.id ORDER BY started_on, created_at LIMIT 1), 'testing');
