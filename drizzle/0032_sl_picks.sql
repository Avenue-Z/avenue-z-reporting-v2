CREATE TABLE "social_listening_picks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"month" date NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"state" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_listening_picks_kind" CHECK ("social_listening_picks"."kind" IN ('author', 'card')),
	CONSTRAINT "social_listening_picks_state" CHECK ("social_listening_picks"."state" IN ('shown', 'hidden')),
	CONSTRAINT "social_listening_picks_key_size" CHECK (char_length("social_listening_picks"."key") BETWEEN 1 AND 500),
	CONSTRAINT "social_listening_picks_month_first" CHECK (EXTRACT(DAY FROM "social_listening_picks"."month") = 1)
);
--> statement-breakpoint
ALTER TABLE "social_listening_picks" ADD CONSTRAINT "social_listening_picks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_listening_picks_client_month_idx" ON "social_listening_picks" USING btree ("client_id","month");