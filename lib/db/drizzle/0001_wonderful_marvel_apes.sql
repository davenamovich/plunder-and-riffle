ALTER TABLE "users" ADD COLUMN "role_label" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "wallet_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_source" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" timestamp;