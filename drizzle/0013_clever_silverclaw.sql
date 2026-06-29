CREATE TABLE "sm_dimension_value_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_slug" text NOT NULL,
	"ds_id" text NOT NULL,
	"account" text NOT NULL,
	"column" text NOT NULL,
	"values" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sm_dim_cache_key" UNIQUE("client_slug","ds_id","account","column")
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "triplewhale_shop_id" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "dashboard_config" jsonb;