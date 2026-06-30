CREATE TABLE "dashboard_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"client_slug" text NOT NULL,
	"title" text NOT NULL,
	"block_ids" jsonb NOT NULL,
	"access" text DEFAULT 'link' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dashboard_shares_token_unique" UNIQUE("token"),
	CONSTRAINT "dashboard_shares_client_slug_unique" UNIQUE("client_slug")
);
