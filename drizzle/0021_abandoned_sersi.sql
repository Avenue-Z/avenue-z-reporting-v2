CREATE TABLE "linkedin_url_resolutions" (
	"url_key" text PRIMARY KEY NOT NULL,
	"canonical_url" text,
	"author_url" text,
	"status" text NOT NULL,
	"resolved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "owned_linkedin_handle" text;