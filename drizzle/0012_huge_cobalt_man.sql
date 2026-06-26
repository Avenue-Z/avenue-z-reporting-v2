ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "shared_password_hash" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "max_seats" integer DEFAULT 5 NOT NULL;