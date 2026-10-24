CREATE TABLE "operations_publication_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"reason" text,
	"changed_by_id" text NOT NULL,
	"changed_by_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE "operations_publication_reservation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"plan_revision" integer NOT NULL,
	"scheduled_publish_at" timestamp with time zone NOT NULL,
	"request_key" uuid NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"requested_by_id" text NOT NULL,
	"requested_by_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_id" text,
	"decided_by_label" text,
	"decision_reason" text,
	"decided_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operations_publication_reservation_request_key_unique" UNIQUE("request_key"),
	CONSTRAINT "operations_reservation_status_check" CHECK ("operations_publication_reservation"."status" IN ('pending','approved','rejected','cancelled','obsolete','fulfilled'))
);

--> statement-breakpoint
ALTER TABLE "operations_content_schedule" ADD COLUMN "publication_url" text;
--> statement-breakpoint
ALTER TABLE "operations_content_schedule" ADD COLUMN "publication_revision" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "operations_publication_event" ADD CONSTRAINT "operations_publication_event_schedule_id_operations_content_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."operations_content_schedule"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "operations_publication_reservation" ADD CONSTRAINT "operations_publication_reservation_schedule_id_operations_content_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."operations_content_schedule"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "operations_publication_event_revision_idx" ON "operations_publication_event" USING btree ("schedule_id","revision");
--> statement-breakpoint
CREATE UNIQUE INDEX "operations_reservation_active_idx" ON "operations_publication_reservation" USING btree ("schedule_id") WHERE "operations_publication_reservation"."status" IN ('pending','approved');
--> statement-breakpoint
CREATE INDEX "operations_reservation_schedule_idx" ON "operations_publication_reservation" USING btree ("schedule_id","created_at");
--> statement-breakpoint
CREATE INDEX "operations_reservation_due_idx" ON "operations_publication_reservation" USING btree ("status","scheduled_publish_at");
