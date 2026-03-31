CREATE TABLE "investigation_url_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"investigation_id" text NOT NULL,
	"normalized_url" text NOT NULL,
	"status" text NOT NULL,
	"reserved_by" text,
	"reserved_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"discovered_from" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "investigation_url_queue" ADD CONSTRAINT "investigation_url_queue_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "investigation_url_queue_investigation_url_unique" ON "investigation_url_queue" USING btree ("investigation_id","normalized_url");
