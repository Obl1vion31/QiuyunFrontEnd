CREATE TABLE "organization_assignment" (
	"user_id" text NOT NULL,
	"position_key" text NOT NULL,
	CONSTRAINT "organization_assignment_user_id_position_key_pk" PRIMARY KEY("user_id","position_key")
);
--> statement-breakpoint
CREATE TABLE "organization_change" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" text NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_position" (
	"key" text PRIMARY KEY NOT NULL,
	"responsibilities" text NOT NULL,
	"deliverables" text NOT NULL,
	"collaboration" text NOT NULL,
	"references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "organization_position_key_check" CHECK ("organization_position"."key" IN ('supervisor','media','design','touchpoint'))
);
--> statement-breakpoint
ALTER TABLE "organization_assignment" ADD CONSTRAINT "organization_assignment_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_assignment" ADD CONSTRAINT "organization_assignment_position_key_organization_position_key_fk" FOREIGN KEY ("position_key") REFERENCES "public"."organization_position"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_change" ADD CONSTRAINT "organization_change_actor_id_auth_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "organization_position" ("key", "responsibilities", "deliverables", "collaboration") VALUES
('supervisor', '制定年度总规划，把握整体运营方向、内容与优先级，管理团队执行，并根据复盘调整安排。', '年度总规划、运营方向与调整决定。', '共同管理新媒体运营、视觉设计与用户触点运营；将规划和优先级交给新媒体运营，接收执行反馈。'),
('media', '根据年度总规划安排内容与任务；结合用户触点反馈和即时信息，组织帖子调整。准备项目文档与设计需求，组织视觉交付、完成视觉设计审查，负责整条内容流程并持续优化。', '项目文档、内容与设计需求、视觉审查结果、帖子调整和流程优化方案。', '向主管反馈执行结果；向视觉设计交付项目文档与需求，审查交付稿；接收用户触点的即时反馈并组织调整。'),
('design', '根据新媒体运营提供的内容和需求完成视觉设计，交付设计稿；响应即时调整，协助新媒体运营沉淀可复用的内容与视觉经验。', '视觉设计交付稿、修订稿、可复用的视觉与内容资料。', '承接新媒体运营的项目文档和设计需求，交付设计稿并根据审查反馈修订。'),
('touchpoint', '处理小红书评论和私信，承接用户到私域，获取并回传即时信息；与销售核对客户来源，为成本核算提供依据。', '用户反馈、私域交接信息、经销售核对的客户来源信息。', '将用户问题和即时信息反馈给新媒体运营；与销售核对来源并完成有效交接，最终销售成交由销售侧承接。');
--> statement-breakpoint
INSERT INTO "organization_assignment" ("user_id", "position_key")
SELECT "id", 'supervisor' FROM "auth_user" WHERE "username" IN ('admin123456', 'boss')
UNION ALL
SELECT "id", "position_key" FROM "auth_user" CROSS JOIN (VALUES ('media'), ('design'), ('touchpoint')) AS roles("position_key") WHERE "username" = 'zongyunying001';
