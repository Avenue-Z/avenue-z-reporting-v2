CREATE TABLE "top_content_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"range_start" date NOT NULL,
	"range_end" date NOT NULL,
	"post_id" bigint NOT NULL,
	"rank" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "top_content_snapshots_window_post_key" UNIQUE("client_id","channel","range_start","range_end","post_id")
);
--> statement-breakpoint
ALTER TABLE "top_content_snapshots" ADD CONSTRAINT "top_content_snapshots_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;