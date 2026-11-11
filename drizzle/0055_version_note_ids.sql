ALTER TABLE "operations_content_version" ADD CONSTRAINT "operations_content_version_identity_key" UNIQUE("id","content_id");
--> statement-breakpoint
CREATE TABLE "operations_note_id_owner" (
	"platform_note_id" text PRIMARY KEY NOT NULL,
	"content_id" uuid NOT NULL,
	CONSTRAINT "operations_note_id_owner_identity_key" UNIQUE("platform_note_id","content_id"),
	CONSTRAINT "operations_note_id_owner_format_check" CHECK ("operations_note_id_owner"."platform_note_id" ~ '^[0-9a-f]{24}$')
);

--> statement-breakpoint
CREATE TABLE "operations_version_note_id" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"effective_on" date,
	"platform_note_id" text,
	"mode" text NOT NULL,
	"source_version_id" uuid,
	CONSTRAINT "operations_version_note_id_mode_check" CHECK ("operations_version_note_id"."mode" IN ('legacy','initial','inherit','new','correction')),
	CONSTRAINT "operations_version_note_id_value_check" CHECK ("operations_version_note_id"."effective_on" IS NULL OR "operations_version_note_id"."platform_note_id" IS NOT NULL)
);

--> statement-breakpoint
ALTER TABLE "operations_note_id_owner" ADD CONSTRAINT "operations_note_id_owner_content_id_operations_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."operations_content"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "operations_version_note_id" ADD CONSTRAINT "operations_version_note_id_source_version_id_operations_content_version_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."operations_content_version"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "operations_version_note_id" ADD CONSTRAINT "operations_version_note_id_version_id_content_id_operations_content_version_id_content_id_fk" FOREIGN KEY ("version_id","content_id") REFERENCES "public"."operations_content_version"("id","content_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "operations_version_note_id" ADD CONSTRAINT "operations_version_note_id_platform_note_id_content_id_operations_note_id_owner_platform_note_id_content_id_fk" FOREIGN KEY ("platform_note_id","content_id") REFERENCES "public"."operations_note_id_owner"("platform_note_id","content_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "operations_version_note_id_baseline_idx" ON "operations_version_note_id" USING btree ("version_id") WHERE "operations_version_note_id"."effective_on" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "operations_version_note_id_date_idx" ON "operations_version_note_id" USING btree ("version_id","effective_on") WHERE "operations_version_note_id"."effective_on" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "operations_version_note_id_lookup_idx" ON "operations_version_note_id" USING btree ("platform_note_id");
--> statement-breakpoint

INSERT INTO operations_note_id_owner(platform_note_id,content_id)
SELECT platform_note_id,id FROM operations_content WHERE platform_note_id IS NOT NULL;
--> statement-breakpoint
INSERT INTO operations_version_note_id(version_id,content_id,effective_on,platform_note_id,mode,source_version_id)
SELECT v.id,v.content_id,NULL,c.platform_note_id,'legacy',v.source_version_id
FROM operations_content_version v JOIN operations_content c ON c.id=v.content_id
WHERE EXISTS(SELECT 1 FROM operations_content_schedule sc WHERE sc.content_version_id=v.id AND sc.actual_publish_at IS NOT NULL
 AND (sc.is_promoted OR EXISTS(SELECT 1 FROM operations_promotion_campaign pc WHERE pc.schedule_id=sc.id)));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_platform_note_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id uuid;
BEGIN
 IF NEW.platform_note_id IS NOT NULL THEN
  INSERT INTO public.operations_note_id_owner(platform_note_id,content_id) VALUES(NEW.platform_note_id,NEW.id) ON CONFLICT DO NOTHING;
  SELECT content_id INTO owner_id FROM public.operations_note_id_owner WHERE platform_note_id=NEW.platform_note_id;
  IF owner_id <> NEW.id THEN RAISE EXCEPTION '笔记 ID 已属于另一篇帖子' USING ERRCODE='23505'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER operations_content_note_owner_guard AFTER INSERT OR UPDATE OF platform_note_id ON operations_content
FOR EACH ROW EXECUTE FUNCTION guard_platform_note_owner();
