ALTER TABLE "operations_meeting_attachment" ADD COLUMN "render_fingerprint" text;--> statement-breakpoint
ALTER TABLE "operations_review_meeting_version" ADD COLUMN "source_version_id" uuid;--> statement-breakpoint
ALTER TABLE "operations_review_meeting_version" ADD COLUMN "version_kind" text DEFAULT 'finalization' NOT NULL;--> statement-breakpoint
ALTER TABLE "operations_review_meeting_version" ADD COLUMN "invalidated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "operations_review_meeting_version" ADD COLUMN "invalidated_by_version_id" uuid;--> statement-breakpoint
ALTER TABLE "operations_review_meeting_version" ADD COLUMN "business_effects" jsonb;--> statement-breakpoint
ALTER TABLE "operations_review_meeting_version" ADD COLUMN "pdf_fingerprint" text;