CREATE TABLE "investigations" (
	"id" text PRIMARY KEY NOT NULL,
	"query" text NOT NULL,
	"status" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"findings" jsonb NOT NULL,
	"blocked_sources" jsonb NOT NULL
);
