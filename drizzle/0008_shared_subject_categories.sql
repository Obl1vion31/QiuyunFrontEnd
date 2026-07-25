CREATE TABLE "operations_category" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "operations_category_name_unique" UNIQUE("name")
);
--> statement-breakpoint
INSERT INTO "operations_category" ("id", "name", "sort_order") VALUES
	('small-class-or-tutoring', '小班课和一对一', 10),
	('promotional-handout', '推广讲义帖', 20),
	('large-class', '正式大班', 30),
	('mock-exam', '模考', 40),
	('intensive-course', '冲刺班', 50),
	('success-story', '成功案例', 60),
	('non-promotional-handout', '非推广讲义帖', 70),
	('exam-information', '考试信息', 80),
	('first-analysis-series', '第一时间解析帖集', 90),
	('score-release-celebration', '出分喜报', 100),
	('exam-guide', '备考须知', 110),
	('innovation', '创新帖', 120);
--> statement-breakpoint
CREATE TABLE "operations_subject_category" (
	"subject_id" text NOT NULL,
	"category_id" text NOT NULL,
	CONSTRAINT "operations_subject_category_subject_id_category_id_pk" PRIMARY KEY("subject_id","category_id")
);
--> statement-breakpoint
ALTER TABLE "operations_subject_category" ADD CONSTRAINT "operations_subject_category_subject_fk"
	FOREIGN KEY ("subject_id") REFERENCES "public"."operations_subject"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "operations_subject_category" ADD CONSTRAINT "operations_subject_category_category_fk"
	FOREIGN KEY ("category_id") REFERENCES "public"."operations_category"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "operations_subject_category_category_idx" ON "operations_subject_category" USING btree ("category_id");
--> statement-breakpoint
INSERT INTO "operations_subject_category" ("subject_id", "category_id")
SELECT 'tmua', "id" FROM "operations_category";
--> statement-breakpoint
INSERT INTO "operations_subject_category" ("subject_id", "category_id")
SELECT 'step', "id" FROM "operations_category" WHERE "id" <> 'intensive-course';
--> statement-breakpoint
ALTER TABLE "operations_content_version" ADD COLUMN "subject_id" text;
--> statement-breakpoint
ALTER TABLE "operations_content_version" DROP CONSTRAINT "operations_content_version_category_id_operations_post_category";
--> statement-breakpoint
ALTER TABLE "operations_content_version" ALTER COLUMN "category_id" DROP NOT NULL;
--> statement-breakpoint
UPDATE "operations_content_version" AS version
SET
	"subject_id" = old_category."subject_id",
	"category_id" = CASE old_category."id"
		WHEN 'tmua-non-promotional-handout' THEN 'non-promotional-handout'
		WHEN 'tmua-success-story' THEN 'success-story'
		WHEN 'tmua-small-class-or-tutoring' THEN 'small-class-or-tutoring'
		WHEN 'tmua-large-class' THEN 'large-class'
		WHEN 'tmua-innovation' THEN 'innovation'
		WHEN 'tmua-exam-guide' THEN CASE
			WHEN split_part(schedule."source_key", ':', 2)::integer IN (2, 14, 26) THEN 'exam-information'
			ELSE 'exam-guide'
		END
		WHEN 'tmua-promotional-handout' THEN 'promotional-handout'
		WHEN 'step-first-analysis-series' THEN 'first-analysis-series'
		WHEN 'interview-exam-guide' THEN NULL
	END
FROM "operations_post_category" AS old_category, "operations_content_schedule" AS schedule
WHERE old_category."id" = version."category_id"
	AND schedule."content_version_id" = version."id";
--> statement-breakpoint
UPDATE "operations_subject" SET "name" = '面试课' WHERE "id" = 'interview';
--> statement-breakpoint
DO $$
DECLARE
	total_versions integer;
	invalid_versions integer;
	tmua_versions integer;
	step_versions integer;
	interview_versions integer;
BEGIN
	SELECT count(*) INTO total_versions FROM "operations_content_version";
	SELECT count(*) INTO invalid_versions
	FROM "operations_content_version" AS version
	WHERE version."subject_id" IS NULL
		OR (version."subject_id" IN ('tmua', 'step') AND version."category_id" IS NULL)
		OR (version."subject_id" = 'interview' AND version."category_id" IS NOT NULL)
		OR (version."category_id" IS NOT NULL AND NOT EXISTS (
			SELECT 1 FROM "operations_subject_category" AS mapping
			WHERE mapping."subject_id" = version."subject_id"
				AND mapping."category_id" = version."category_id"
		));
	SELECT count(*) INTO tmua_versions FROM "operations_content_version" WHERE "subject_id" = 'tmua';
	SELECT count(*) INTO step_versions FROM "operations_content_version" WHERE "subject_id" = 'step';
	SELECT count(*) INTO interview_versions FROM "operations_content_version" WHERE "subject_id" = 'interview';
	IF total_versions <> 53 OR invalid_versions <> 0
		OR tmua_versions <> 32 OR step_versions <> 20 OR interview_versions <> 1 THEN
		RAISE EXCEPTION '通用分类校验失败：总数 %，无效 %，TMUA %，STEP %，面试课 %',
			total_versions, invalid_versions, tmua_versions, step_versions, interview_versions;
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "operations_content_version" ALTER COLUMN "subject_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "operations_content_version" ADD CONSTRAINT "operations_content_version_subject_fk"
	FOREIGN KEY ("subject_id") REFERENCES "public"."operations_subject"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "operations_content_version" ADD CONSTRAINT "operations_content_version_category_fk"
	FOREIGN KEY ("category_id") REFERENCES "public"."operations_category"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "operations_content_version" ADD CONSTRAINT "operations_content_version_subject_category_fk"
	FOREIGN KEY ("subject_id","category_id") REFERENCES "public"."operations_subject_category"("subject_id","category_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "operations_content_version" ADD CONSTRAINT "operations_content_version_category_required_check" CHECK (
	("subject_id" IN ('tmua', 'step') AND "category_id" IS NOT NULL)
	OR ("subject_id" = 'interview' AND "category_id" IS NULL)
);
--> statement-breakpoint
DROP TABLE "operations_post_category";
