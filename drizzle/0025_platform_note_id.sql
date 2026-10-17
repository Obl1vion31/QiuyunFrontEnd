ALTER TABLE "operations_content"
ADD COLUMN "platform_note_id" text;
--> statement-breakpoint
ALTER TABLE "operations_content"
ADD CONSTRAINT "operations_content_platform_note_id_format_check"
CHECK ("platform_note_id" IS NULL OR "platform_note_id" ~ '^[0-9a-f]{24}$');
--> statement-breakpoint
CREATE UNIQUE INDEX "operations_content_platform_note_id_unique"
ON "operations_content" USING btree ("platform_note_id")
WHERE "platform_note_id" IS NOT NULL;
