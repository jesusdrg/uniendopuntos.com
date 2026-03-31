DROP INDEX "investigation_url_queue_investigation_url_unique";--> statement-breakpoint
ALTER TABLE "investigation_url_queue" ADD COLUMN "normalized_url_hash" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "investigation_url_queue_investigation_url_hash_unique" ON "investigation_url_queue" USING btree ("investigation_id","normalized_url_hash");