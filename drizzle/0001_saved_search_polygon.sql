-- saved_search and search_execution were originally created with `db:push`,
-- so every statement here is idempotent to work on existing databases too.
CREATE TABLE IF NOT EXISTS "saved_search" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"polygon" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"lastScrapedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "search_execution" (
	"id" text PRIMARY KEY NOT NULL,
	"savedSearchId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"resultsCount" integer NOT NULL,
	"results" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_search" ADD COLUMN IF NOT EXISTS "polygon" jsonb;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saved_search" ADD CONSTRAINT "saved_search_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "search_execution" ADD CONSTRAINT "search_execution_savedSearchId_saved_search_id_fk" FOREIGN KEY ("savedSearchId") REFERENCES "public"."saved_search"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
