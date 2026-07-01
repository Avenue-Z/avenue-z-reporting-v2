CREATE TABLE "section_templates" (
	"section_slug" text PRIMARY KEY NOT NULL,
	"composition" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"promoted_from" text
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "report_section_config" jsonb;