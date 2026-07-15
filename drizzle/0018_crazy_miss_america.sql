ALTER TABLE "report_commentary" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "report_commentary" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "report_commentary" ADD CONSTRAINT "report_commentary_no_deleted_approved" CHECK ("report_commentary"."deleted_at" IS NULL OR "report_commentary"."status" = 'draft');