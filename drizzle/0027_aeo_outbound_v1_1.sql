CREATE TABLE "aeo_outbound_opens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"ua_family" text NOT NULL,
	"likely_automated" boolean NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "aeo_outbound_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"users" jsonb NOT NULL,
	"admins" jsonb NOT NULL,
	"section_titles" jsonb NOT NULL,
	"fixed_next_step" text,
	"rank_among" integer,
	"peec_opportunity_rows" integer NOT NULL,
	"methodology_states_prompts_and_models" boolean NOT NULL,
	"sidebar_wordmark" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "aeo_outbound_settings_single_row" CHECK ("aeo_outbound_settings"."id")
);
--> statement-breakpoint
CREATE TABLE "aeo_outbound_settings_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"changed_at" timestamp with time zone NOT NULL,
	"changed_by" text NOT NULL,
	"field" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb
);
--> statement-breakpoint
ALTER TABLE "aeo_outbound_reports" ADD COLUMN "progress_step" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "aeo_outbound_reports" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "aeo_outbound_opens" ADD CONSTRAINT "aeo_outbound_opens_report_id_aeo_outbound_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."aeo_outbound_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aeo_outbound_opens_report_idx" ON "aeo_outbound_opens" USING btree ("report_id","opened_at");--> statement-breakpoint
CREATE INDEX "aeo_outbound_settings_log_changed_idx" ON "aeo_outbound_settings_log" USING btree ("changed_at");