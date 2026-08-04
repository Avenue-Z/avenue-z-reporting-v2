CREATE TYPE "public"."post_designation" AS ENUM('organic', 'influencer');--> statement-breakpoint
CREATE TABLE "post_designations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"post_id" bigint NOT NULL,
	"designation" "post_designation" NOT NULL,
	"set_by" text NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_designations_client_post_key" UNIQUE("client_id","post_id")
);
--> statement-breakpoint
ALTER TABLE "post_designations" ADD CONSTRAINT "post_designations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_designations_client_idx" ON "post_designations" USING btree ("client_id");