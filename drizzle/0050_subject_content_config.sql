CREATE TABLE "operations_content_config" (
	"subject_id" text PRIMARY KEY NOT NULL,
	"config" jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_by_id" text,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "operations_content_config" ADD CONSTRAINT "operations_content_config_subject_id_operations_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."operations_subject"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_content_config" ADD CONSTRAINT "operations_content_config_updated_by_id_auth_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
INSERT INTO operations_content_config(subject_id,config,revision,updated_by,history)
SELECT s.id,jsonb_build_object(
 'purposes','[{"id":"course","name":"课程"},{"id":"handout","name":"讲义"},{"id":"mock","name":"模考"}]'::jsonb,
 'types',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,
   'defaultOperationType',CASE WHEN c.id IN ('mock-exam','promotional-handout') THEN 'promotion_then_continuous'
    WHEN c.id IN ('small-class-or-tutoring','large-class','intensive-course','interview-course') THEN 'promotion_only' ELSE 'non_promotion_standard' END,
   'purposeId',CASE WHEN legacy.entries ? (s.id||':'||c.id) THEN legacy.entries->(s.id||':'||c.id)
    WHEN c.id IN ('small-class-or-tutoring','large-class','intensive-course','interview-course') THEN '"course"'::jsonb
    WHEN c.id IN ('promotional-handout','non-promotional-handout') THEN '"handout"'::jsonb
    WHEN c.id='mock-exam' THEN '"mock"'::jsonb ELSE 'null'::jsonb END) ORDER BY c.sort_order,c.name)
  FROM operations_subject_category m JOIN operations_category c ON c.id=m.category_id WHERE m.subject_id=s.id),'[]'::jsonb)
),0,'系统兼容迁移','[]'::jsonb
FROM operations_subject s LEFT JOIN operations_monthly_cost_mapping legacy ON legacy.id='global'
ON CONFLICT(subject_id) DO NOTHING;
