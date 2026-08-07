CREATE TABLE "operations_subject" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "operations_subject_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "operations_post_category" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_id" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "operations_post_category" ADD CONSTRAINT "operations_post_category_subject_id_operations_subject_id_fk"
	FOREIGN KEY ("subject_id") REFERENCES "public"."operations_subject"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "operations_post_category_subject_name_idx" ON "operations_post_category" USING btree ("subject_id","name");
--> statement-breakpoint
CREATE INDEX "operations_post_category_subject_idx" ON "operations_post_category" USING btree ("subject_id");
--> statement-breakpoint
INSERT INTO "operations_subject" ("id", "name", "sort_order") VALUES
	('tmua', 'TMUA', 10),
	('step', 'STEP', 20),
	('interview', '面试', 30);
--> statement-breakpoint
INSERT INTO "operations_post_category" ("id", "subject_id", "name", "sort_order") VALUES
	('tmua-non-promotional-handout', 'tmua', 'TMUA 非推广讲义', 10),
	('tmua-success-story', 'tmua', 'TMUA 成功案例', 20),
	('tmua-small-class-or-tutoring', 'tmua', 'TMUA 小班课或一对一', 30),
	('tmua-large-class', 'tmua', 'TMUA 大班', 40),
	('tmua-innovation', 'tmua', 'TMUA 创新', 50),
	('tmua-exam-guide', 'tmua', 'TMUA 备考须知', 60),
	('tmua-promotional-handout', 'tmua', 'TMUA 推广讲义', 70),
	('step-first-analysis-series', 'step', '第一时间解析帖集', 10),
	('interview-exam-guide', 'interview', '面试备考须知', 10);
--> statement-breakpoint
ALTER TABLE "operations_content_version" ADD COLUMN "category_id" text;
--> statement-breakpoint
UPDATE "operations_content_version" AS version
SET "category_id" = CASE split_part(schedule."source_key", ':', 2)::integer
	WHEN 51 THEN 'tmua-non-promotional-handout'
	WHEN 52 THEN 'tmua-non-promotional-handout'
	WHEN 54 THEN 'tmua-non-promotional-handout'
	WHEN 33 THEN 'tmua-non-promotional-handout'
	WHEN 37 THEN 'tmua-non-promotional-handout'
	WHEN 38 THEN 'tmua-non-promotional-handout'
	WHEN 41 THEN 'tmua-non-promotional-handout'
	WHEN 43 THEN 'tmua-non-promotional-handout'
	WHEN 28 THEN 'tmua-non-promotional-handout'
	WHEN 29 THEN 'tmua-non-promotional-handout'
	WHEN 32 THEN 'tmua-non-promotional-handout'
	WHEN 34 THEN 'tmua-success-story'
	WHEN 44 THEN 'tmua-success-story'
	WHEN 46 THEN 'tmua-small-class-or-tutoring'
	WHEN 35 THEN 'tmua-small-class-or-tutoring'
	WHEN 36 THEN 'tmua-small-class-or-tutoring'
	WHEN 23 THEN 'tmua-small-class-or-tutoring'
	WHEN 39 THEN 'tmua-large-class'
	WHEN 40 THEN 'tmua-large-class'
	WHEN 21 THEN 'tmua-large-class'
	WHEN 47 THEN 'tmua-innovation'
	WHEN 48 THEN 'tmua-innovation'
	WHEN 50 THEN 'tmua-innovation'
	WHEN 42 THEN 'tmua-innovation'
	WHEN 53 THEN 'tmua-exam-guide'
	WHEN 45 THEN 'tmua-exam-guide'
	WHEN 2 THEN 'tmua-exam-guide'
	WHEN 14 THEN 'tmua-exam-guide'
	WHEN 26 THEN 'tmua-exam-guide'
	WHEN 30 THEN 'tmua-exam-guide'
	WHEN 49 THEN 'tmua-promotional-handout'
	WHEN 31 THEN 'tmua-promotional-handout'
	WHEN 3 THEN 'step-first-analysis-series'
	WHEN 4 THEN 'step-first-analysis-series'
	WHEN 5 THEN 'step-first-analysis-series'
	WHEN 6 THEN 'step-first-analysis-series'
	WHEN 7 THEN 'step-first-analysis-series'
	WHEN 8 THEN 'step-first-analysis-series'
	WHEN 9 THEN 'step-first-analysis-series'
	WHEN 10 THEN 'step-first-analysis-series'
	WHEN 11 THEN 'step-first-analysis-series'
	WHEN 12 THEN 'step-first-analysis-series'
	WHEN 13 THEN 'step-first-analysis-series'
	WHEN 15 THEN 'step-first-analysis-series'
	WHEN 16 THEN 'step-first-analysis-series'
	WHEN 17 THEN 'step-first-analysis-series'
	WHEN 18 THEN 'step-first-analysis-series'
	WHEN 19 THEN 'step-first-analysis-series'
	WHEN 20 THEN 'step-first-analysis-series'
	WHEN 22 THEN 'step-first-analysis-series'
	WHEN 24 THEN 'step-first-analysis-series'
	WHEN 25 THEN 'step-first-analysis-series'
	WHEN 27 THEN 'interview-exam-guide'
END
FROM "operations_content_schedule" AS schedule
WHERE schedule."content_version_id" = version."id"
	AND schedule."source_key" LIKE '20260725-operations-content:%';
--> statement-breakpoint
DO $$
DECLARE
	total_versions integer;
	unclassified_versions integer;
	tmua_versions integer;
	step_versions integer;
	interview_versions integer;
BEGIN
	SELECT count(*) INTO total_versions FROM "operations_content_version";
	SELECT count(*) INTO unclassified_versions FROM "operations_content_version" WHERE "category_id" IS NULL;
	SELECT count(*) INTO tmua_versions FROM "operations_content_version" WHERE "category_id" LIKE 'tmua-%';
	SELECT count(*) INTO step_versions FROM "operations_content_version" WHERE "category_id" = 'step-first-analysis-series';
	SELECT count(*) INTO interview_versions FROM "operations_content_version" WHERE "category_id" = 'interview-exam-guide';
	IF total_versions <> 53 OR unclassified_versions <> 0
		OR tmua_versions <> 32 OR step_versions <> 20 OR interview_versions <> 1 THEN
		RAISE EXCEPTION '历史分类校验失败：总数 %，未分类 %，TMUA %，STEP %，面试 %',
			total_versions, unclassified_versions, tmua_versions, step_versions, interview_versions;
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "operations_content_version" ALTER COLUMN "category_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "operations_content_version" ADD CONSTRAINT "operations_content_version_category_id_operations_post_category_id_fk"
	FOREIGN KEY ("category_id") REFERENCES "public"."operations_post_category"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "operations_content_version" DROP CONSTRAINT "operations_content_version_revision_check";
--> statement-breakpoint
ALTER TABLE "operations_content_version" DROP COLUMN "content_type";
--> statement-breakpoint
ALTER TABLE "operations_content_version" DROP COLUMN "revision_types";
--> statement-breakpoint
ALTER TABLE "operations_content_version" DROP COLUMN "revision_goal";
--> statement-breakpoint
ALTER TABLE "operations_content_version" ADD CONSTRAINT "operations_content_version_revision_check" CHECK (
	("version_number" = 0 AND "work_type" = 'new' AND "source_version_id" IS NULL
		AND "revision_summary" IS NULL)
	OR
	("version_number" > 0 AND "work_type" = 'revision' AND "source_version_id" IS NOT NULL
		AND length(trim("revision_summary")) > 0)
);
