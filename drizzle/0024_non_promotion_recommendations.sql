INSERT INTO "operations_category" ("id", "name", "sort_order")
VALUES ('score-release-collection', '出分合集', 100)
ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name";
--> statement-breakpoint
INSERT INTO "operations_subject_category" ("subject_id", "category_id")
VALUES
  ('tmua', 'score-release-collection'),
  ('step', 'score-release-collection')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "operations_category_policy_version"
ADD COLUMN "requires_non_promotion_review" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "operations_non_promotion_review"
ALTER COLUMN "conclusion" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "operations_non_promotion_review"
ADD COLUMN "current_version_number" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "operations_non_promotion_review"
ADD CONSTRAINT "operations_non_promotion_review_version_check"
CHECK ("current_version_number" >= 0);
--> statement-breakpoint
CREATE TABLE "operations_non_promotion_review_version" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "review_id" uuid NOT NULL,
  "version_number" integer NOT NULL,
  "snapshot" jsonb NOT NULL,
  "change_summary" text NOT NULL,
  "changed_by_label" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "operations_non_promotion_review_version_number_check" CHECK ("version_number" >= 0)
);
--> statement-breakpoint
ALTER TABLE "operations_non_promotion_review_version"
ADD CONSTRAINT "operations_non_promotion_review_version_review_id_fk"
FOREIGN KEY ("review_id") REFERENCES "public"."operations_non_promotion_review"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "operations_non_promotion_review_version_idx"
ON "operations_non_promotion_review_version" USING btree ("review_id", "version_number");
--> statement-breakpoint
ALTER TABLE "operations_review_meeting"
ALTER COLUMN "draft_snapshot" SET DEFAULT '{"schemaVersion":2,"coreConclusion":"","nextAction":"","promotionInputs":{},"issues":[],"nonPromotionSelections":[]}'::jsonb;
--> statement-breakpoint
WITH latest AS (
  SELECT DISTINCT ON ("category_id")
    "category_id", "version_number", "display_name", "default_is_promoted", "is_selectable", "effective_on"
  FROM "operations_category_policy_version"
  WHERE "category_id" = 'first-analysis-series'
  ORDER BY "category_id", "version_number" DESC
)
INSERT INTO "operations_category_policy_version" (
  "category_id", "version_number", "display_name", "default_is_promoted", "is_selectable",
  "requires_non_promotion_review", "effective_on", "change_summary", "changed_by_label"
)
SELECT
  'first-analysis-series', COALESCE(latest."version_number", 0) + 1,
  COALESCE(latest."display_name", '第一时间解析帖集'), COALESCE(latest."default_is_promoted", false),
  COALESCE(latest."is_selectable", true), false, DATE '2026-08-31',
  '第一时间解析帖集不进入非推广首轮/二轮复盘', 'migration:0024'
FROM (SELECT 1) seed
LEFT JOIN latest ON true;
