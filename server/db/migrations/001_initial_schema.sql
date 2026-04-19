-- ============================================================================
-- Nudge — Initial Database Schema
-- PostgreSQL 16 + PostGIS
-- ============================================================================
-- This migration creates the complete data model for the Nudge proximity app.
-- PostGIS is enabled for ephemeral in-memory geospatial math only.
-- NO table stores GPS coordinates (Zero Persistent Location Data mandate).
-- ============================================================================

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Custom ENUM Types ──────────────────────────────────────────────────────
CREATE TYPE friendship_status  AS ENUM ('pending', 'accepted', 'blocked');
CREATE TYPE vibe_response      AS ENUM ('yes', 'maybe_later', 'not_today');
CREATE TYPE rally_status       AS ENUM ('proposed', 'confirmed', 'cancelled');
CREATE TYPE rsvp_status        AS ENUM ('going', 'maybe', 'declined');
CREATE TYPE quest_type         AS ENUM ('daily', 'weekly', 'streak');

-- ─── Users ───────────────────────────────────────────────────────────────────
-- Core user table. Auth via Apple ID; phone is optional for contact-book
-- friend discovery. Status fields support the 2-hour cooldown ephemeral status.
CREATE TABLE users (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    apple_id          TEXT        UNIQUE,
    phone_number      TEXT        UNIQUE,
    phone_verified    BOOLEAN     NOT NULL DEFAULT FALSE,
    display_name      VARCHAR(50) NOT NULL,
    username          VARCHAR(30) UNIQUE,
    avatar_url        TEXT,
    bio               VARCHAR(160),
    status_emoji      VARCHAR(10),
    status_text       VARCHAR(100),
    status_expires_at TIMESTAMPTZ,
    push_token        TEXT,
    settings          JSONB       NOT NULL DEFAULT '{}',
    last_active_at    TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for active status lookups (partial — only non-expired)
CREATE INDEX idx_users_active_status
    ON users (id)
    WHERE status_expires_at > NOW();

-- Index for phone-based friend discovery
CREATE INDEX idx_users_phone
    ON users (phone_number)
    WHERE phone_number IS NOT NULL;

-- ─── Friendships ─────────────────────────────────────────────────────────────
-- Bidirectional friend pairs. Unique constraint prevents duplicate requests.
-- Only 'accepted' friendships allow proximity data exchange (mutual consent).
CREATE TABLE friendships (
    id             UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id   UUID              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id   UUID              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status         friendship_status NOT NULL DEFAULT 'pending',
    accepted_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_friendship_pair UNIQUE (requester_id, addressee_id),
    CONSTRAINT ck_no_self_friend  CHECK  (requester_id <> addressee_id)
);

-- Fast lookup: "all friends of user X"
CREATE INDEX idx_friendships_requester ON friendships (requester_id, status);
CREATE INDEX idx_friendships_addressee ON friendships (addressee_id, status);

-- ─── Circles ─────────────────────────────────────────────────────────────────
-- Named friend groups (e.g. "College Crew 🎓"). Each circle has an owner and
-- an optional proximity threshold override (in meters).
CREATE TABLE circles (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id            UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                VARCHAR(50) NOT NULL,
    emoji               VARCHAR(10),
    color               VARCHAR(7),
    proximity_threshold INTEGER     NOT NULL DEFAULT 500, -- meters
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_circles_owner ON circles (owner_id);

-- ─── Circle Members ──────────────────────────────────────────────────────────
-- Join table linking circles to users. Composite PK prevents duplicate membership.
CREATE TABLE circle_members (
    circle_id  UUID NOT NULL REFERENCES circles(id)  ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (circle_id, user_id)
);

CREATE INDEX idx_circle_members_user ON circle_members (user_id);

-- ─── Statuses ────────────────────────────────────────────────────────────────
-- Ephemeral statuses with a 2-hour maximum lifespan. The most recent non-expired
-- status for a user is their "current" status. A cooldown is enforced at the
-- application layer: users cannot post a new status until the previous one expires.
CREATE TABLE statuses (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji       VARCHAR(10)  NOT NULL,
    text        VARCHAR(100) NOT NULL,
    expires_at  TIMESTAMPTZ  NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Partial index: efficiently find a user's currently active status
CREATE INDEX idx_statuses_active
    ON statuses (user_id, expires_at DESC)
    WHERE expires_at > NOW();

-- ─── Nudge Events ────────────────────────────────────────────────────────────
-- Audit trail of proximity matches. Stores AI-generated suggestions and
-- venue/weather context as JSONB blobs from the Claude Sonnet API response.
-- No GPS coordinates are ever persisted here.
CREATE TABLE nudge_events (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    proximity_meters REAL,
    ai_suggestion    JSONB,
    venue_context    JSONB,
    weather_context  JSONB,
    circle_id        UUID        REFERENCES circles(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nudge_events_sender   ON nudge_events (sender_id, created_at DESC);
CREATE INDEX idx_nudge_events_receiver ON nudge_events (receiver_id, created_at DESC);
CREATE INDEX idx_nudge_events_ai       ON nudge_events USING GIN (ai_suggestion);

-- ─── Vibe Checks ─────────────────────────────────────────────────────────────
-- User response to a nudge notification. One response per nudge per responder.
CREATE TABLE vibe_checks (
    id             UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    nudge_event_id UUID           NOT NULL REFERENCES nudge_events(id) ON DELETE CASCADE,
    responder_id   UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    response       vibe_response  NOT NULL,
    responded_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_vibe_per_nudge UNIQUE (nudge_event_id, responder_id)
);

CREATE INDEX idx_vibe_checks_responder ON vibe_checks (responder_id, responded_at DESC);

-- ─── Memories ────────────────────────────────────────────────────────────────
-- Photos and captions from real-world meetups that happened after a nudge.
CREATE TABLE memories (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    nudge_event_id UUID         NOT NULL REFERENCES nudge_events(id) ON DELETE CASCADE,
    creator_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    photo_url      TEXT         NOT NULL,
    caption        VARCHAR(280),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_memories_nudge   ON memories (nudge_event_id);
CREATE INDEX idx_memories_creator ON memories (creator_id, created_at DESC);

-- ─── Rallies ─────────────────────────────────────────────────────────────────
-- Group meetup proposals tied to a circle. Includes optional venue metadata
-- from Yelp Fusion API.
CREATE TABLE rallies (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id    UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    circle_id     UUID          NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
    title         VARCHAR(100)  NOT NULL,
    description   VARCHAR(500),
    venue_id      TEXT,
    venue_name    VARCHAR(200),
    venue_address TEXT,
    venue_lat     DOUBLE PRECISION,
    venue_lng     DOUBLE PRECISION,
    scheduled_at  TIMESTAMPTZ   NOT NULL,
    status        rally_status  NOT NULL DEFAULT 'proposed',
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rallies_circle    ON rallies (circle_id, scheduled_at DESC);
CREATE INDEX idx_rallies_creator   ON rallies (creator_id, created_at DESC);
CREATE INDEX idx_rallies_upcoming  ON rallies (scheduled_at)
    WHERE status = 'confirmed';

-- ─── Rally RSVPs ─────────────────────────────────────────────────────────────
CREATE TABLE rally_rsvps (
    id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    rally_id  UUID        NOT NULL REFERENCES rallies(id) ON DELETE CASCADE,
    user_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status    rsvp_status NOT NULL DEFAULT 'maybe',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_rsvp_per_rally UNIQUE (rally_id, user_id)
);

CREATE INDEX idx_rally_rsvps_user ON rally_rsvps (user_id);

-- ─── Quests ──────────────────────────────────────────────────────────────────
-- AI-driven social challenges. Progress is tracked as a counter toward a goal.
-- Quests expire and may be daily, weekly, or part of a streak system.
CREATE TABLE quests (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        VARCHAR(100) NOT NULL,
    description  VARCHAR(500),
    type         quest_type   NOT NULL,
    progress     INTEGER      NOT NULL DEFAULT 0,
    goal         INTEGER      NOT NULL DEFAULT 1,
    xp_reward    INTEGER      NOT NULL DEFAULT 10,
    completed_at TIMESTAMPTZ,
    expires_at   TIMESTAMPTZ  NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_quest_progress CHECK (progress >= 0 AND progress <= goal)
);

CREATE INDEX idx_quests_user_active
    ON quests (user_id, expires_at DESC)
    WHERE completed_at IS NULL;

-- ─── Updated-At Trigger ─────────────────────────────────────────────────────
-- Automatically set updated_at on row modification for all tables that have it.
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON friendships
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON circles
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON rallies
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON rally_rsvps
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
