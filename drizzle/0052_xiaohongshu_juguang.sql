CREATE TABLE "xiaohongshu_juguang_connection" (
	"app_id" text NOT NULL,
	"authorization_user_id" text NOT NULL,
	"encrypted_tokens" text NOT NULL,
	"access_token_expires_at" timestamp with time zone NOT NULL,
	"refresh_token_expires_at" timestamp with time zone NOT NULL,
	"advertisers" jsonb NOT NULL,
	"scope" text,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "xiaohongshu_juguang_connection_app_id_authorization_user_id_pk" PRIMARY KEY("app_id","authorization_user_id")
);
--> statement-breakpoint
ALTER TABLE "xiaohongshu_juguang_connection" ADD CONSTRAINT "xiaohongshu_juguang_connection_updated_by_auth_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;