CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."slot_status" AS ENUM('active', 'expired', 'pending');--> statement-breakpoint
CREATE TYPE "public"."slot_type" AS ENUM('free', 'paid');--> statement-breakpoint
CREATE TABLE "agent_keywords" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"keywords" text[] DEFAULT '{}' NOT NULL,
	"pain_points" text[] DEFAULT '{}' NOT NULL,
	"buyer_intent_phrases" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"slug" text NOT NULL,
	"display_name" text,
	"bio" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"referral_code" text NOT NULL,
	"referred_by_id" text,
	"is_abuse_flagged" boolean DEFAULT false NOT NULL,
	"wallet_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_slug_unique" UNIQUE("slug"),
	CONSTRAINT "users_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"persona" text,
	"offer_url" text NOT NULL,
	"fallback_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_paused" boolean DEFAULT false NOT NULL,
	"free_slot_capacity" integer DEFAULT 25 NOT NULL,
	"paid_slot_capacity" integer DEFAULT 25 NOT NULL,
	"free_slot_weight" integer DEFAULT 1 NOT NULL,
	"paid_slot_weight" integer DEFAULT 3 NOT NULL,
	"slot_duration_hours" integer DEFAULT 24 NOT NULL,
	"daily_cap" integer DEFAULT 100 NOT NULL,
	"daily_lead_count" integer DEFAULT 0 NOT NULL,
	"daily_cap_reset_at" timestamp DEFAULT now() NOT NULL,
	"paid_slot_price" real DEFAULT 9.99 NOT NULL,
	"lead_approval_mode" text DEFAULT 'manual' NOT NULL,
	"nft_mint_enabled" boolean DEFAULT false NOT NULL,
	"total_clicks" integer DEFAULT 0 NOT NULL,
	"total_signups" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agents_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "inherited_ref_links" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"offer_id" text NOT NULL,
	"referrer_user_id" text NOT NULL,
	"inherited_url" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_signups" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"offer_id" text NOT NULL,
	"affiliate_ref" text,
	"signed_up_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"offer_url" text NOT NULL,
	"logo_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_qualifying" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "offers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "personal_rotator_links" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"offer_id" text,
	"display_name" text NOT NULL,
	"url" text NOT NULL,
	"logo_url" text,
	"link_type" text DEFAULT 'offer' NOT NULL,
	"display_order" text DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rotator_clicks" (
	"id" text PRIMARY KEY NOT NULL,
	"slot_id" text NOT NULL,
	"user_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"ref_code" text,
	"ip_hash" text,
	"clicked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rotator_slots" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"slot_type" "slot_type" NOT NULL,
	"status" "slot_status" DEFAULT 'active' NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"activated_at" timestamp,
	"expired_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"content" text NOT NULL,
	"author_handle" text,
	"author_url" text,
	"post_url" text,
	"status" text DEFAULT 'raw' NOT NULL,
	"score" real,
	"score_reason" text,
	"score_details" text,
	"reply_style" text,
	"draft" text,
	"posted_at" timestamp,
	"rejected_at" timestamp,
	"rejected_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "leads_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "api_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"call_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_usage_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "funnel_events" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text,
	"event_type" text NOT NULL,
	"platform" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dm_sends" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"sequence_id" text NOT NULL,
	"step_index" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"message" text,
	"scheduled_at" timestamp,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dm_sequences" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_slug" text DEFAULT 'ralph' NOT NULL,
	"name" text NOT NULL,
	"steps" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_keywords" ADD CONSTRAINT "agent_keywords_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inherited_ref_links" ADD CONSTRAINT "inherited_ref_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inherited_ref_links" ADD CONSTRAINT "inherited_ref_links_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inherited_ref_links" ADD CONSTRAINT "inherited_ref_links_referrer_user_id_users_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_signups" ADD CONSTRAINT "offer_signups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_signups" ADD CONSTRAINT "offer_signups_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_rotator_links" ADD CONSTRAINT "personal_rotator_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_rotator_links" ADD CONSTRAINT "personal_rotator_links_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotator_clicks" ADD CONSTRAINT "rotator_clicks_slot_id_rotator_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."rotator_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotator_clicks" ADD CONSTRAINT "rotator_clicks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotator_clicks" ADD CONSTRAINT "rotator_clicks_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotator_slots" ADD CONSTRAINT "rotator_slots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotator_slots" ADD CONSTRAINT "rotator_slots_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;