CREATE TABLE "social_listening_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"month" date NOT NULL,
	"topic" text NOT NULL,
	"results" integer,
	"unique_authors" integer,
	"engagement" double precision,
	"potential_reach" double precision,
	"pos" integer NOT NULL,
	"neu" integer NOT NULL,
	"neg" integer NOT NULL,
	"reddit_pos" integer,
	"reddit_neu" integer,
	"reddit_neg" integer,
	"source" text NOT NULL,
	CONSTRAINT "social_listening_history_client_month_topic_key" UNIQUE("client_id","month","topic"),
	CONSTRAINT "social_listening_history_topic" CHECK ("social_listening_history"."topic" IN ('brand', 'industry')),
	CONSTRAINT "social_listening_history_month_first" CHECK (EXTRACT(DAY FROM "social_listening_history"."month") = 1)
);
--> statement-breakpoint
CREATE TABLE "social_listening_post_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"bytes" "bytea" NOT NULL,
	"print_bytes" "bytea" NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_listening_post_images_sizes" CHECK (octet_length("social_listening_post_images"."bytes") <= 307200 AND octet_length("social_listening_post_images"."print_bytes") <= 61440)
);
--> statement-breakpoint
CREATE TABLE "social_listening_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"month" date NOT NULL,
	"group" text NOT NULL,
	"platform" text NOT NULL,
	"author" text NOT NULL,
	"url" text,
	"engagements" integer,
	"sentiment" text NOT NULL,
	"note" text NOT NULL,
	"position" integer NOT NULL,
	"status" "commentary_status" DEFAULT 'draft' NOT NULL,
	"replaces_id" uuid,
	"replaced_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	CONSTRAINT "social_listening_posts_no_deleted_approved" CHECK ("social_listening_posts"."deleted_at" IS NULL OR "social_listening_posts"."status" = 'draft'),
	CONSTRAINT "social_listening_posts_group" CHECK ("social_listening_posts"."group" IN ('social', 'forum', 'web')),
	CONSTRAINT "social_listening_posts_sentiment" CHECK ("social_listening_posts"."sentiment" IN ('Positive', 'Neutral', 'Negative')),
	CONSTRAINT "social_listening_posts_https" CHECK ("social_listening_posts"."url" IS NULL OR "social_listening_posts"."url" LIKE 'https://%'),
	CONSTRAINT "social_listening_posts_note_length" CHECK (char_length("social_listening_posts"."note") <= 1000),
	CONSTRAINT "social_listening_posts_month_first" CHECK (EXTRACT(DAY FROM "social_listening_posts"."month") = 1)
);
--> statement-breakpoint
CREATE TABLE "social_listening_trends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"month" date NOT NULL,
	"emerging" jsonb NOT NULL,
	"decreasing" jsonb NOT NULL,
	"new_themes" jsonb NOT NULL,
	"approved_emerging" jsonb,
	"approved_decreasing" jsonb,
	"approved_new" jsonb,
	"status" "commentary_status" DEFAULT 'draft' NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	CONSTRAINT "social_listening_trends_client_month_key" UNIQUE("client_id","month"),
	CONSTRAINT "social_listening_trends_month_first" CHECK (EXTRACT(DAY FROM "social_listening_trends"."month") = 1)
);
--> statement-breakpoint
CREATE TABLE "social_listening_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"month" date NOT NULL,
	"topic" text NOT NULL,
	"data" jsonb NOT NULL,
	"raw" "bytea" NOT NULL,
	"sha256" text NOT NULL,
	"byte_size" integer NOT NULL,
	"before_open" boolean NOT NULL,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_listening_uploads_topic" CHECK ("social_listening_uploads"."topic" IN ('brand', 'industry')),
	CONSTRAINT "social_listening_uploads_month_first" CHECK (EXTRACT(DAY FROM "social_listening_uploads"."month") = 1),
	CONSTRAINT "social_listening_uploads_raw_size" CHECK (octet_length("social_listening_uploads"."raw") <= 2097152 AND "social_listening_uploads"."byte_size" = octet_length("social_listening_uploads"."raw"))
);
--> statement-breakpoint
ALTER TABLE "social_listening_history" ADD CONSTRAINT "social_listening_history_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_listening_post_images" ADD CONSTRAINT "social_listening_post_images_post_id_social_listening_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."social_listening_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_listening_posts" ADD CONSTRAINT "social_listening_posts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_listening_posts" ADD CONSTRAINT "social_listening_posts_replaces_id_social_listening_posts_id_fk" FOREIGN KEY ("replaces_id") REFERENCES "public"."social_listening_posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_listening_trends" ADD CONSTRAINT "social_listening_trends_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_listening_uploads" ADD CONSTRAINT "social_listening_uploads_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_listening_post_images_post_idx" ON "social_listening_post_images" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "social_listening_posts_client_month_idx" ON "social_listening_posts" USING btree ("client_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX "social_listening_posts_one_open_draft" ON "social_listening_posts" USING btree ("replaces_id") WHERE status = 'draft' AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "social_listening_uploads_client_month_topic_idx" ON "social_listening_uploads" USING btree ("client_id","month","topic");