CREATE TABLE "operations_meeting_attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_length" integer NOT NULL,
	"base64" text NOT NULL,
	"created_by_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operations_meeting_attachment_size_check" CHECK ("operations_meeting_attachment"."byte_length" > 0 AND "operations_meeting_attachment"."byte_length" <= 3145728),
	CONSTRAINT "operations_meeting_attachment_type_check" CHECK ("operations_meeting_attachment"."mime_type" IN ('image/png','image/jpeg','image/webp'))
);
--> statement-breakpoint
CREATE TABLE "operations_promotion_stage_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_key" uuid NOT NULL,
	"name" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"created_by_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operations_promotion_stage_review_request_key_unique" UNIQUE("request_key"),
	CONSTRAINT "operations_promotion_stage_review_dates_check" CHECK ("operations_promotion_stage_review"."period_end" >= "operations_promotion_stage_review"."period_start")
);
--> statement-breakpoint
CREATE TABLE "operations_promotion_stage_review_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_by_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operations_promotion_stage_review_version_number_check" CHECK ("operations_promotion_stage_review_version"."version_number" >= 0)
);
--> statement-breakpoint
CREATE TABLE "operations_promotion_wait_range" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"started_on" date NOT NULL,
	"ended_on" date NOT NULL,
	"stage_type" text NOT NULL,
	"reason" text NOT NULL,
	"next_decision" text,
	"next_effective_on" date,
	"revision" integer DEFAULT 0 NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by_label" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operations_promotion_wait_range_request_key_unique" UNIQUE("request_key"),
	CONSTRAINT "operations_promotion_wait_dates_check" CHECK ("operations_promotion_wait_range"."ended_on" >= "operations_promotion_wait_range"."started_on" AND ("operations_promotion_wait_range"."next_effective_on" IS NULL OR "operations_promotion_wait_range"."next_effective_on" > "operations_promotion_wait_range"."ended_on")),
	CONSTRAINT "operations_promotion_wait_stage_check" CHECK ("operations_promotion_wait_range"."stage_type" IN ('testing','scaling')),
	CONSTRAINT "operations_promotion_wait_decision_check" CHECK (("operations_promotion_wait_range"."next_decision" IS NULL AND "operations_promotion_wait_range"."next_effective_on" IS NULL) OR ("operations_promotion_wait_range"."next_decision" IS NOT NULL AND "operations_promotion_wait_range"."next_effective_on" IS NOT NULL AND (("operations_promotion_wait_range"."stage_type" = 'testing' AND "operations_promotion_wait_range"."next_decision" IN ('test_continue','start_scaling','test_discarded')) OR ("operations_promotion_wait_range"."stage_type" = 'scaling' AND "operations_promotion_wait_range"."next_decision" IN ('scaling_continue','formal_discarded','ended')))))
);
--> statement-breakpoint
ALTER TABLE "operations_meeting_attachment" ADD CONSTRAINT "operations_meeting_attachment_meeting_id_operations_review_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."operations_review_meeting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_promotion_stage_review_version" ADD CONSTRAINT "operations_promotion_stage_review_version_review_id_operations_promotion_stage_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."operations_promotion_stage_review"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_promotion_wait_range" ADD CONSTRAINT "operations_promotion_wait_range_campaign_id_operations_promotion_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."operations_promotion_campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "operations_promotion_stage_review_version_idx" ON "operations_promotion_stage_review_version" USING btree ("review_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "operations_promotion_wait_start_idx" ON "operations_promotion_wait_range" USING btree ("campaign_id","started_on");