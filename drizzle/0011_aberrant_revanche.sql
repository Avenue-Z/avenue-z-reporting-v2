CREATE TABLE "health_state" (
	"key" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"detail" text,
	"since" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
