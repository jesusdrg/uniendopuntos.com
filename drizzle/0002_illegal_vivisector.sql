ALTER TABLE "blocked_sources" ALTER COLUMN "blocked_at" SET DATA TYPE timestamp with time zone USING "blocked_at"::timestamptz;--> statement-breakpoint
ALTER TABLE "findings" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamptz;--> statement-breakpoint
ALTER TABLE "investigations" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamptz;--> statement-breakpoint
ALTER TABLE "investigations" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamptz;
