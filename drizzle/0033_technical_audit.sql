CREATE TABLE "tech_audit_issue_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"issue_key" text NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"note" text,
	"note_by" text,
	"note_at" timestamp with time zone,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tech_audit_issue_overrides_client_issue_key" UNIQUE("client_id","issue_key"),
	CONSTRAINT "tech_audit_issue_overrides_note_len" CHECK ("tech_audit_issue_overrides"."note" IS NULL OR char_length("tech_audit_issue_overrides"."note") <= 280)
);
--> statement-breakpoint
CREATE TABLE "tech_audit_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"sf_issue_types_issue" integer,
	"sf_issue_types_warning" integer,
	"sf_issue_types_opportunity" integer,
	"sf_urls_issue" integer,
	"sf_urls_warning" integer,
	"sf_urls_opportunity" integer,
	"ahrefs_health_score" integer,
	"gsc_indexed" integer,
	"gsc_not_indexed" integer,
	"cwv_mobile_poor" integer,
	"cwv_mobile_ni" integer,
	"cwv_mobile_good" integer,
	"cwv_desktop_poor" integer,
	"cwv_desktop_ni" integer,
	"cwv_desktop_good" integer,
	CONSTRAINT "tech_audit_metrics_snapshot_key" UNIQUE("snapshot_id")
);
--> statement-breakpoint
CREATE TABLE "tech_audit_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"snapshot_date" date NOT NULL,
	"sf_run_folder_id" text,
	"sf_crawl_date" date,
	"ahrefs_crawl_date" date,
	"gsc_export_date" date,
	"ahrefs_health_score" integer,
	"crawl_settings_changed" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tech_audit_snapshots_client_date_key" UNIQUE("client_id","snapshot_date"),
	CONSTRAINT "tech_audit_snapshots_status" CHECK ("tech_audit_snapshots"."status" IN ('draft', 'published'))
);
--> statement-breakpoint
CREATE TABLE "tech_audit_source_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"source" text NOT NULL,
	"native_issue_name" text NOT NULL,
	"native_severity" text NOT NULL,
	"url_count" integer NOT NULL,
	"device" text,
	CONSTRAINT "tech_audit_source_issues_source" CHECK ("tech_audit_source_issues"."source" IN ('ahrefs', 'sf', 'gsc_indexing', 'gsc_cwv')),
	CONSTRAINT "tech_audit_source_issues_device" CHECK ("tech_audit_source_issues"."device" IS NULL OR "tech_audit_source_issues"."device" IN ('mobile', 'desktop'))
);
--> statement-breakpoint
CREATE TABLE "tech_audit_source_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"uploaded_by" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"raw" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tech_audit_source_runs_snapshot_source_key" UNIQUE("snapshot_id","source"),
	CONSTRAINT "tech_audit_source_runs_source" CHECK ("tech_audit_source_runs"."source" IN ('sf', 'ahrefs', 'gsc_indexing', 'gsc_cwv_mobile', 'gsc_cwv_desktop')),
	CONSTRAINT "tech_audit_source_runs_status" CHECK ("tech_audit_source_runs"."status" IN ('pending', 'complete', 'failed', 'missing')),
	CONSTRAINT "tech_audit_source_runs_raw_size" CHECK ("tech_audit_source_runs"."raw" IS NULL OR octet_length("tech_audit_source_runs"."raw") <= 2097152)
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "sf_drive_folder_id" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "ahrefs_project_id" text;--> statement-breakpoint
ALTER TABLE "tech_audit_issue_overrides" ADD CONSTRAINT "tech_audit_issue_overrides_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tech_audit_metrics" ADD CONSTRAINT "tech_audit_metrics_snapshot_id_tech_audit_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."tech_audit_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tech_audit_snapshots" ADD CONSTRAINT "tech_audit_snapshots_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tech_audit_source_issues" ADD CONSTRAINT "tech_audit_source_issues_snapshot_id_tech_audit_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."tech_audit_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tech_audit_source_runs" ADD CONSTRAINT "tech_audit_source_runs_snapshot_id_tech_audit_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."tech_audit_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tech_audit_source_issues_snapshot_idx" ON "tech_audit_source_issues" USING btree ("snapshot_id");