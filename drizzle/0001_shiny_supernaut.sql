CREATE TABLE "blocked_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"investigation_id" text NOT NULL,
	"url" text NOT NULL,
	"reason_category" text NOT NULL,
	"note" text,
	"blocked_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" text PRIMARY KEY NOT NULL,
	"investigation_id" text NOT NULL,
	"title" text NOT NULL,
	"source_url" text NOT NULL,
	"summary" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blocked_sources" ADD CONSTRAINT "blocked_sources_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "blocked_sources_investigation_url_reason_unique" ON "blocked_sources" USING btree ("investigation_id","url","reason_category");