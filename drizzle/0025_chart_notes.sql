CREATE TABLE "chart_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"chart" text NOT NULL,
	"day" date NOT NULL,
	"body" text NOT NULL,
	"post_ids" bigint[] DEFAULT '{}'::bigint[] NOT NULL,
	"status" "commentary_status" DEFAULT 'draft' NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	CONSTRAINT "chart_notes_no_deleted_approved" CHECK ("chart_notes"."deleted_at" IS NULL OR "chart_notes"."status" = 'draft')
);
--> statement-breakpoint
ALTER TABLE "chart_notes" ADD CONSTRAINT "chart_notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chart_notes_client_channel_idx" ON "chart_notes" USING btree ("client_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "chart_notes_one_open_draft" ON "chart_notes" USING btree ("client_id","channel","chart","day") WHERE status = 'draft' AND deleted_at IS NULL;