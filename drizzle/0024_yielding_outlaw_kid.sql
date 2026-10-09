CREATE TABLE "chart_annotation_hides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"chart" text NOT NULL,
	"day" date NOT NULL,
	"hidden" boolean NOT NULL,
	"set_by" text NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chart_annotation_hides_client_callout_key" UNIQUE("client_id","channel","chart","day")
);
--> statement-breakpoint
CREATE TABLE "dash_response_locks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"request_key" text NOT NULL,
	"period_end" date NOT NULL,
	"response" jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dash_response_locks_client_request_key" UNIQUE("client_id","request_key")
);
--> statement-breakpoint
ALTER TABLE "chart_annotation_hides" ADD CONSTRAINT "chart_annotation_hides_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dash_response_locks" ADD CONSTRAINT "dash_response_locks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chart_annotation_hides_client_idx" ON "chart_annotation_hides" USING btree ("client_id");