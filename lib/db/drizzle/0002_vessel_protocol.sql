-- VESSEL PROTOCOL — Schema Migration
-- Generated for Railway deployment

DO $$ BEGIN
  CREATE TYPE "vessel_slot_status" AS ENUM('pending_offer','pending_link_save','active','expired','waitlisted');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "vessel_slot_type" AS ENUM('free','paid');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "vessel_split_recipient" AS ENUM('referrer','agent_ops','bot_ops','protocol');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "vessel_agent_status" AS ENUM('draft','active','full','paused');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "vessel_agent_config" (
  "id"                     text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "agent_id"               text NOT NULL UNIQUE REFERENCES "agents"("id") ON DELETE CASCADE,
  "offer_name"             text NOT NULL,
  "offer_url"              text NOT NULL,
  "offer_cta_text"         text NOT NULL DEFAULT 'Sign Up Free — Takes 2 Minutes',
  "offer_tagline"          text,
  "offer_logo_url"         text,
  "vessel_status"          "vessel_agent_status" NOT NULL DEFAULT 'draft',
  "total_paid_seats"       integer NOT NULL DEFAULT 50,
  "filled_paid_seats"      integer NOT NULL DEFAULT 0,
  "paid_seat_price_usd"    real NOT NULL DEFAULT 50.00,
  "daily_free_cap"         integer NOT NULL DEFAULT 1,
  "daily_free_issued_today" integer NOT NULL DEFAULT 0,
  "daily_free_reset_at"    timestamp NOT NULL DEFAULT now(),
  "agent_ops_wallet"       text,
  "bot_ops_wallet"         text,
  "protocol_wallet"        text,
  "token_symbol"           text,
  "token_contract"         text,
  "token_launched_at"      timestamp,
  "ctv_enabled"            boolean NOT NULL DEFAULT false,
  "created_at"             timestamp NOT NULL DEFAULT now(),
  "updated_at"             timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "vessel_slots" (
  "id"                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "agent_id"            text NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "user_id"             text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "slot_type"           "vessel_slot_type" NOT NULL DEFAULT 'free',
  "status"              "vessel_slot_status" NOT NULL DEFAULT 'pending_offer',
  "offer_clicked_at"    timestamp,
  "link_saved_at"       timestamp,
  "activated_at"        timestamp,
  "expires_at"          timestamp,
  "paid_amount_usd"     real,
  "stripe_session_id"   text,
  "paid_at"             timestamp,
  "referred_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "times_rotated"       integer NOT NULL DEFAULT 0,
  "last_rotated_at"     timestamp,
  "created_at"          timestamp NOT NULL DEFAULT now(),
  "updated_at"          timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "vessel_slots_agent_user_idx" ON "vessel_slots"("agent_id","user_id");
CREATE INDEX IF NOT EXISTS "vessel_slots_status_idx" ON "vessel_slots"("status");
CREATE INDEX IF NOT EXISTS "vessel_slots_expires_idx" ON "vessel_slots"("expires_at");

CREATE TABLE IF NOT EXISTS "vessel_conversion_events" (
  "id"                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "agent_id"            text NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "affiliate_user_id"   text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "converted_user_id"   text REFERENCES "users"("id") ON DELETE SET NULL,
  "event_type"          text NOT NULL DEFAULT 'offer_signup',
  "gross_amount_usd"    real NOT NULL DEFAULT 0,
  "referral_code"       text,
  "platform"            text,
  "post_id"             text,
  "split_processed"     boolean NOT NULL DEFAULT false,
  "split_batch_id"      text,
  "created_at"          timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "vessel_conv_affiliate_idx" ON "vessel_conversion_events"("affiliate_user_id");
CREATE INDEX IF NOT EXISTS "vessel_conv_agent_idx" ON "vessel_conversion_events"("agent_id");

CREATE TABLE IF NOT EXISTS "vessel_split_ledger" (
  "id"                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "event_id"            text NOT NULL REFERENCES "vessel_conversion_events"("id") ON DELETE CASCADE,
  "agent_id"            text NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "recipient"           "vessel_split_recipient" NOT NULL,
  "recipient_user_id"   text REFERENCES "users"("id") ON DELETE SET NULL,
  "recipient_address"   text,
  "split_pct"           real NOT NULL DEFAULT 25.0,
  "gross_usd"           real NOT NULL,
  "split_amount_usd"    real NOT NULL,
  "status"              text NOT NULL DEFAULT 'pending',
  "tx_hash"             text,
  "paid_at"             timestamp,
  "fail_reason"         text,
  "created_at"          timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "vessel_split_event_idx" ON "vessel_split_ledger"("event_id");
CREATE INDEX IF NOT EXISTS "vessel_split_recipient_idx" ON "vessel_split_ledger"("recipient_user_id");

CREATE TABLE IF NOT EXISTS "vessel_rotation_log" (
  "id"          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "agent_id"    text NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "user_id"     text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "slot_id"     text NOT NULL REFERENCES "vessel_slots"("id") ON DELETE CASCADE,
  "platform"    text NOT NULL,
  "post_id"     text,
  "post_url"    text,
  "link_used"   text NOT NULL,
  "created_at"  timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "vessel_rotation_agent_day_idx" ON "vessel_rotation_log"("agent_id","created_at");

CREATE TABLE IF NOT EXISTS "vessel_waitlist" (
  "id"                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "agent_id"            text NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "user_id"             text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "referred_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "position"            integer NOT NULL,
  "notified_at"         timestamp,
  "converted_at"        timestamp,
  "created_at"          timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "vessel_waitlist_agent_pos_idx" UNIQUE("agent_id","position")
);
