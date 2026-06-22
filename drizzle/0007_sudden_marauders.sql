ALTER TABLE "clients" ADD COLUMN "sm_api_key_env_var" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "paid_search_config" jsonb;