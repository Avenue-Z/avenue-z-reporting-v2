ALTER TABLE "clients" ADD COLUMN "ga4_config" jsonb;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "hidden_journey_stages" text[] DEFAULT '{}' NOT NULL;