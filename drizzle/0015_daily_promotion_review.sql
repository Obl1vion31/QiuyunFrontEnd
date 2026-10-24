ALTER TABLE "operations_content_schedule"
ADD COLUMN "is_promoted" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

UPDATE "operations_content_schedule"
SET "is_promoted" = ("promotion_status" <> 'none');
--> statement-breakpoint

UPDATE "operations_content_schedule"
SET "promotion_status" = 'testing', "updated_at" = now()
WHERE "is_promoted" = true
  AND "actual_publish_at" IS NOT NULL
  AND "promotion_status" = 'pending';
--> statement-breakpoint

ALTER TABLE "operations_content_schedule"
ADD CONSTRAINT "operations_schedule_promotion_consistency_check"
CHECK (
  ("is_promoted" = false AND "promotion_status" = 'none')
  OR
  ("is_promoted" = true AND "promotion_status" IN (
    'pending', 'testing', 'scaling', 'ended', 'test_discarded', 'formal_discarded'
  ))
);
--> statement-breakpoint

CREATE INDEX "operations_schedule_is_promoted_idx"
ON "operations_content_schedule" USING btree ("is_promoted");
--> statement-breakpoint

CREATE TABLE "operations_promotion_campaign" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "schedule_id" uuid NOT NULL,
  "started_on" date NOT NULL,
  "ended_on" date,
  "current_stage" text,
  "current_status" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "operations_promotion_campaign_status_check"
    CHECK ("current_status" IN ('testing', 'scaling', 'ended', 'test_discarded', 'formal_discarded')),
  CONSTRAINT "operations_promotion_campaign_stage_check"
    CHECK (
      ("current_status" = 'testing' AND "current_stage" = 'testing')
      OR ("current_status" = 'scaling' AND "current_stage" = 'scaling')
      OR ("current_status" IN ('ended', 'test_discarded', 'formal_discarded') AND "current_stage" IS NULL)
    ),
  CONSTRAINT "operations_promotion_campaign_dates_check"
    CHECK ("ended_on" IS NULL OR "ended_on" >= "started_on")
);
--> statement-breakpoint

ALTER TABLE "operations_promotion_campaign"
ADD CONSTRAINT "operations_promotion_campaign_schedule_id_operations_content_schedule_id_fk"
FOREIGN KEY ("schedule_id") REFERENCES "public"."operations_content_schedule"("id")
ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "operations_promotion_campaign_schedule_idx"
ON "operations_promotion_campaign" USING btree ("schedule_id");
--> statement-breakpoint

CREATE INDEX "operations_promotion_campaign_status_idx"
ON "operations_promotion_campaign" USING btree ("current_status");
--> statement-breakpoint

CREATE TABLE "operations_promotion_stage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL,
  "stage_type" text NOT NULL,
  "started_on" date NOT NULL,
  "ended_on" date,
  "outcome" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "operations_promotion_stage_type_check"
    CHECK ("stage_type" IN ('testing', 'scaling')),
  CONSTRAINT "operations_promotion_stage_outcome_check"
    CHECK ("outcome" IS NULL OR "outcome" IN (
      'continued', 'start_scaling', 'test_discarded', 'scaling_continued', 'ended', 'formal_discarded'
    )),
  CONSTRAINT "operations_promotion_stage_dates_check"
    CHECK ("ended_on" IS NULL OR "ended_on" >= "started_on")
);
--> statement-breakpoint

ALTER TABLE "operations_promotion_stage"
ADD CONSTRAINT "operations_promotion_stage_campaign_id_operations_promotion_campaign_id_fk"
FOREIGN KEY ("campaign_id") REFERENCES "public"."operations_promotion_campaign"("id")
ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "operations_promotion_stage_campaign_idx"
ON "operations_promotion_stage" USING btree ("campaign_id", "started_on");
--> statement-breakpoint

CREATE TABLE "operations_promotion_daily_metric" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL,
  "metric_date" date NOT NULL,
  "stage_type_snapshot" text NOT NULL,
  "spend" numeric(12, 2) NOT NULL,
  "click_rate" numeric(7, 4) NOT NULL,
  "platform_open_count" integer NOT NULL,
  "actual_open_count" integer NOT NULL,
  "platform_lead_count" integer NOT NULL,
  "actual_lead_count" integer NOT NULL,
  "review_decision" text NOT NULL,
  "reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "operations_promotion_daily_stage_check" CHECK ("stage_type_snapshot" IN ('testing', 'scaling')),
  CONSTRAINT "operations_promotion_daily_spend_check" CHECK ("spend" >= 0),
  CONSTRAINT "operations_promotion_daily_click_rate_check" CHECK ("click_rate" BETWEEN 0 AND 100),
  CONSTRAINT "operations_promotion_daily_counts_check"
    CHECK (
      "platform_open_count" >= 0
      AND "actual_open_count" >= 0
      AND "platform_lead_count" >= 0
      AND "actual_lead_count" >= 0
    ),
  CONSTRAINT "operations_promotion_daily_decision_check"
    CHECK (
      ("stage_type_snapshot" = 'testing' AND "review_decision" IN ('test_continue', 'test_discarded', 'start_scaling'))
      OR
      ("stage_type_snapshot" = 'scaling' AND "review_decision" IN ('scaling_continue', 'formal_discarded', 'ended'))
    )
);
--> statement-breakpoint

ALTER TABLE "operations_promotion_daily_metric"
ADD CONSTRAINT "operations_promotion_daily_metric_campaign_id_operations_promotion_campaign_id_fk"
FOREIGN KEY ("campaign_id") REFERENCES "public"."operations_promotion_campaign"("id")
ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE UNIQUE INDEX "operations_promotion_daily_campaign_date_idx"
ON "operations_promotion_daily_metric" USING btree ("campaign_id", "metric_date");
--> statement-breakpoint

CREATE INDEX "operations_promotion_daily_date_idx"
ON "operations_promotion_daily_metric" USING btree ("metric_date");
--> statement-breakpoint

INSERT INTO "operations_promotion_campaign" (
  "schedule_id",
  "started_on",
  "current_stage",
  "current_status"
)
SELECT
  schedule."id",
  (schedule."actual_publish_at" AT TIME ZONE 'Asia/Shanghai')::date,
  schedule."promotion_status",
  schedule."promotion_status"
FROM "operations_content_schedule" schedule
WHERE schedule."is_promoted" = true
  AND schedule."actual_publish_at" IS NOT NULL
  AND schedule."promotion_status" IN ('testing', 'scaling');
--> statement-breakpoint

INSERT INTO "operations_promotion_stage" (
  "campaign_id",
  "stage_type",
  "started_on"
)
SELECT
  campaign."id",
  campaign."current_stage",
  GREATEST(campaign."started_on", CURRENT_DATE)
FROM "operations_promotion_campaign" campaign
WHERE campaign."current_status" IN ('testing', 'scaling');
