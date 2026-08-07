DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "operations_annual_plan" LIMIT 1)
    OR EXISTS (SELECT 1 FROM "operations_annual_plan_month" LIMIT 1)
    OR EXISTS (SELECT 1 FROM "operations_annual_plan_link" LIMIT 1)
    OR EXISTS (SELECT 1 FROM "operations_annual_plan_version" LIMIT 1)
  THEN
    RAISE EXCEPTION 'THE PLAN 旧结构中已有业务数据，请先制定数据转换方案，迁移已安全中止';
  END IF;
END
$$;
--> statement-breakpoint
DROP TABLE "operations_annual_plan_version";
--> statement-breakpoint
DROP TABLE "operations_annual_plan_link";
--> statement-breakpoint
DROP TABLE "operations_annual_plan_month";
--> statement-breakpoint
DROP TABLE "operations_annual_plan";
--> statement-breakpoint
DROP TABLE "operations_course";
--> statement-breakpoint
CREATE TABLE "operations_annual_plan_year" (
  "year" integer PRIMARY KEY NOT NULL,
  "instructions" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "operations_annual_plan_year_number_check" CHECK ("year" BETWEEN 2000 AND 9999)
);
--> statement-breakpoint
CREATE TABLE "operations_annual_plan" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "year" integer NOT NULL,
  "section_key" text NOT NULL,
  "section_label" text NOT NULL,
  "subject_id" text,
  "row_name" text NOT NULL,
  "category_id" text,
  "course_name" text,
  "note" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "current_version_number" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "operations_annual_plan_year_check" CHECK ("year" BETWEEN 2000 AND 9999),
  CONSTRAINT "operations_annual_plan_version_check" CHECK ("current_version_number" >= 1),
  CONSTRAINT "operations_annual_plan_section_subject_check" CHECK ("subject_id" IS NOT NULL OR "category_id" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "operations_annual_plan" ADD CONSTRAINT "operations_annual_plan_subject_fk"
  FOREIGN KEY ("subject_id") REFERENCES "public"."operations_subject"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "operations_annual_plan" ADD CONSTRAINT "operations_annual_plan_category_fk"
  FOREIGN KEY ("category_id") REFERENCES "public"."operations_category"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "operations_annual_plan" ADD CONSTRAINT "operations_annual_plan_subject_category_fk"
  FOREIGN KEY ("subject_id", "category_id") REFERENCES "public"."operations_subject_category"("subject_id", "category_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "operations_annual_plan_row_identity_idx"
  ON "operations_annual_plan" ("year", "section_key", "row_name");
--> statement-breakpoint
CREATE INDEX "operations_annual_plan_year_section_sort_idx"
  ON "operations_annual_plan" ("year", "section_key", "sort_order");
--> statement-breakpoint
CREATE TABLE "operations_annual_plan_block" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "plan_id" uuid NOT NULL,
  "start_month" integer NOT NULL,
  "end_month" integer NOT NULL,
  "label" text NOT NULL,
  "rule_type" text,
  "monthly_frequency" integer,
  "quantity_parts" integer[],
  "note" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "operations_annual_plan_block_month_check"
    CHECK ("start_month" BETWEEN 1 AND 12 AND "end_month" BETWEEN "start_month" AND 12),
  CONSTRAINT "operations_annual_plan_block_rule_check" CHECK (
    ("rule_type" IS NULL AND "monthly_frequency" IS NULL AND "quantity_parts" IS NULL)
    OR
    ("rule_type" = 'flexible' AND "monthly_frequency" > 0 AND "quantity_parts" IS NULL)
    OR
    ("rule_type" = 'fixed' AND "monthly_frequency" IS NULL
      AND cardinality("quantity_parts") > 0 AND 0 < ALL("quantity_parts"))
  )
);
--> statement-breakpoint
ALTER TABLE "operations_annual_plan_block" ADD CONSTRAINT "operations_annual_plan_block_plan_fk"
  FOREIGN KEY ("plan_id") REFERENCES "public"."operations_annual_plan"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "operations_annual_plan_block_plan_sort_idx"
  ON "operations_annual_plan_block" ("plan_id", "sort_order");
--> statement-breakpoint
CREATE TABLE "operations_annual_plan_link" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "plan_id" uuid NOT NULL,
  "label" text NOT NULL,
  "url" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "operations_annual_plan_link" ADD CONSTRAINT "operations_annual_plan_link_plan_fk"
  FOREIGN KEY ("plan_id") REFERENCES "public"."operations_annual_plan"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "operations_annual_plan_link_plan_idx"
  ON "operations_annual_plan_link" ("plan_id", "sort_order");
--> statement-breakpoint
CREATE TABLE "operations_annual_plan_version" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "plan_id" uuid NOT NULL,
  "version_number" integer NOT NULL,
  "snapshot" jsonb NOT NULL,
  "change_summary" text NOT NULL,
  "diff_summary" jsonb NOT NULL,
  "changed_by_label" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "operations_annual_plan_version_number_check" CHECK ("version_number" >= 1)
);
--> statement-breakpoint
ALTER TABLE "operations_annual_plan_version" ADD CONSTRAINT "operations_annual_plan_version_plan_fk"
  FOREIGN KEY ("plan_id") REFERENCES "public"."operations_annual_plan"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "operations_annual_plan_version_number_idx"
  ON "operations_annual_plan_version" ("plan_id", "version_number");
--> statement-breakpoint
CREATE INDEX "operations_annual_plan_version_created_idx"
  ON "operations_annual_plan_version" ("plan_id", "created_at");
