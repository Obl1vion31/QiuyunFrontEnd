CREATE TABLE "operations_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operations_content_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"source_version_id" uuid,
	"work_type" text NOT NULL,
	"content_name" text NOT NULL,
	"content_type" text NOT NULL,
	"revision_types" text[],
	"revision_summary" text,
	"revision_goal" text,
	"project_doc_name" text,
	"project_doc_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operations_content_version_number_check" CHECK ("version_number" >= 0),
	CONSTRAINT "operations_content_version_work_type_check" CHECK ("work_type" IN ('new', 'revision')),
	CONSTRAINT "operations_content_version_revision_check" CHECK (
		("version_number" = 0 AND "work_type" = 'new' AND "source_version_id" IS NULL
			AND "revision_types" IS NULL AND "revision_summary" IS NULL AND "revision_goal" IS NULL)
		OR
		("version_number" > 0 AND "work_type" = 'revision' AND "source_version_id" IS NOT NULL
			AND cardinality("revision_types") > 0
			AND length(trim("revision_summary")) > 0
			AND length(trim("revision_goal")) > 0)
	)
);
--> statement-breakpoint
ALTER TABLE "operations_content_schedule" ADD COLUMN "content_version_id" uuid;
--> statement-breakpoint
INSERT INTO "operations_content" ("id", "created_at", "updated_at")
SELECT "id", "created_at", "updated_at" FROM "operations_content_schedule";
--> statement-breakpoint
INSERT INTO "operations_content_version"
	("content_id", "version_number", "work_type", "content_name", "content_type",
	 "project_doc_name", "project_doc_url", "created_at", "updated_at")
SELECT "id", 0, 'new', "content_name", "content_type",
	"project_doc_name", "project_doc_url", "created_at", "updated_at"
FROM "operations_content_schedule";
--> statement-breakpoint
UPDATE "operations_content_schedule" AS schedule
SET "content_version_id" = version."id"
FROM "operations_content_version" AS version
WHERE version."content_id" = schedule."id" AND version."version_number" = 0;
--> statement-breakpoint
ALTER TABLE "operations_content_schedule" ALTER COLUMN "content_version_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "operations_content_version" ADD CONSTRAINT "operations_content_version_content_id_operations_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."operations_content"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "operations_content_version" ADD CONSTRAINT "operations_content_version_source_version_id_operations_content_version_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."operations_content_version"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "operations_content_schedule" ADD CONSTRAINT "operations_content_schedule_content_version_id_operations_content_version_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."operations_content_version"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
DROP INDEX "operations_schedule_planned_at_idx";
--> statement-breakpoint
DROP INDEX "operations_schedule_promotion_idx";
--> statement-breakpoint
DROP INDEX "operations_schedule_completion_idx";
--> statement-breakpoint
DROP INDEX "operations_schedule_source_key_idx";
--> statement-breakpoint
ALTER TABLE "operations_content_schedule" DROP COLUMN "content_name";
--> statement-breakpoint
ALTER TABLE "operations_content_schedule" DROP COLUMN "content_type";
--> statement-breakpoint
ALTER TABLE "operations_content_schedule" DROP COLUMN "project_doc_name";
--> statement-breakpoint
ALTER TABLE "operations_content_schedule" DROP COLUMN "project_doc_url";
--> statement-breakpoint
CREATE UNIQUE INDEX "operations_content_version_number_idx" ON "operations_content_version" USING btree ("content_id","version_number");
--> statement-breakpoint
CREATE INDEX "operations_content_version_source_idx" ON "operations_content_version" USING btree ("source_version_id");
--> statement-breakpoint
CREATE INDEX "operations_schedule_version_idx" ON "operations_content_schedule" USING btree ("content_version_id");
--> statement-breakpoint
CREATE INDEX "operations_schedule_planned_at_idx" ON "operations_content_schedule" USING btree ("planned_publish_at");
--> statement-breakpoint
CREATE INDEX "operations_schedule_promotion_idx" ON "operations_content_schedule" USING btree ("promotion_status");
--> statement-breakpoint
CREATE INDEX "operations_schedule_completion_idx" ON "operations_content_schedule" USING btree ("completion_status");
--> statement-breakpoint
CREATE UNIQUE INDEX "operations_schedule_source_key_idx" ON "operations_content_schedule" USING btree ("source_key");
