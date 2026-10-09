CREATE TYPE "public"."aeo_outbound_status" AS ENUM('generating', 'draft', 'approved', 'failed');--> statement-breakpoint
CREATE TABLE "aeo_outbound_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"peec_project_id" text NOT NULL,
	"peec_project_name" text NOT NULL,
	"brand_name" text,
	"status" "aeo_outbound_status" DEFAULT 'generating' NOT NULL,
	"data" jsonb,
	"slots" jsonb,
	"notes" jsonb,
	"revision" integer DEFAULT 0 NOT NULL,
	"error" text,
	"html" text,
	"share_token" text,
	"rerun_of" uuid,
	"created_by" text NOT NULL,
	"approved_by" text,
	"revoked_by" text,
	"deleted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"share_revoked_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "aeo_outbound_reports_share_token_unique" UNIQUE("share_token"),
	CONSTRAINT "aeo_outbound_approved_complete" CHECK (("aeo_outbound_reports"."status" = 'approved') = ("aeo_outbound_reports"."html" IS NOT NULL AND "aeo_outbound_reports"."share_token" IS NOT NULL AND "aeo_outbound_reports"."approved_at" IS NOT NULL)),
	CONSTRAINT "aeo_outbound_revoke_only_approved" CHECK ("aeo_outbound_reports"."share_revoked_at" IS NULL OR "aeo_outbound_reports"."status" = 'approved'),
	CONSTRAINT "aeo_outbound_delete_only_draft_failed" CHECK ("aeo_outbound_reports"."deleted_at" IS NULL OR "aeo_outbound_reports"."status" IN ('draft', 'failed'))
);
--> statement-breakpoint
CREATE INDEX "aeo_outbound_created_idx" ON "aeo_outbound_reports" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "aeo_outbound_one_generating" ON "aeo_outbound_reports" USING btree ("peec_project_id") WHERE status = 'generating';