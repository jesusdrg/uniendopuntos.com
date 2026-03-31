ALTER TABLE "investigations" ADD COLUMN "finding_connections" jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "related_finding_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "shared_entity_keys" jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "claim_hashes" jsonb NOT NULL DEFAULT '[]'::jsonb;
