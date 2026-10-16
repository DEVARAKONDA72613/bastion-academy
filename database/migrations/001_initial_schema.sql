-- ============================================================
-- Bastion Academy — Database Schema (PostgreSQL 15+)
-- Day 1 deliverable. Run against an empty database.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";   -- for case-insensitive email column

-- ------------------------------------------------------------
-- Shared: auto-update updated_at trigger
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- IDENTITY & ACCESS
-- ============================================================

CREATE TABLE roles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT UNIQUE NOT NULL, -- 'free','bronze','silver','gold','instructor','admin'
  description   TEXT
);

CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             CITEXT UNIQUE NOT NULL,
  phone             TEXT UNIQUE,
  password_hash     TEXT NOT NULL, -- argon2id; never store plaintext, never log this column
  role_id           UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  status            TEXT NOT NULL DEFAULT 'active', -- active, suspended, deactivated
  theme_preference  TEXT NOT NULL DEFAULT 'auto',   -- auto, light, dark
  email_verified_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ -- soft delete: preserves FK history for audit/payments
);
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_users_role ON users(role_id) WHERE deleted_at IS NULL;

CREATE TABLE profiles (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name       TEXT NOT NULL,
  avatar_url         TEXT,
  bio                TEXT,
  country            TEXT,
  state              TEXT,
  city               TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'en',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- SUBSCRIPTIONS & PAYMENTS
-- ============================================================

-- Centralized plan configuration (Section 5/6 requirement:
-- limits must be changeable without rewriting application logic).
CREATE TABLE subscription_plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  TEXT UNIQUE NOT NULL, -- FREE, BRONZE, SILVER, GOLD
  name                  TEXT NOT NULL,
  price_inr             NUMERIC(10,2) NOT NULL DEFAULT 0,
  billing_period_days   INTEGER NOT NULL DEFAULT 30,
  streaming_quality     TEXT NOT NULL, -- '720p','1080p','4k'
  download_daily_limit  INTEGER NOT NULL, -- -1 = unlimited
  live_room_access      TEXT NOT NULL, -- 'observer','join','host'
  premium_track_access  TEXT NOT NULL, -- 'none','limited','all','all_early'
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_subscriptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id        UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  status         TEXT NOT NULL DEFAULT 'active', -- active, expired, cancelled
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ, -- null for FREE plan
  auto_renew     BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_user_subs_updated_at BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- Fast "what's my current plan" lookup — the single most frequent query in the app
CREATE INDEX idx_user_subs_current ON user_subscriptions(user_id, status, expires_at);

CREATE TABLE payments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  user_subscription_id  UUID REFERENCES user_subscriptions(id) ON DELETE SET NULL,
  razorpay_order_id     TEXT UNIQUE NOT NULL,
  razorpay_payment_id   TEXT UNIQUE, -- null until captured
  amount_inr            NUMERIC(10,2) NOT NULL,
  currency              TEXT NOT NULL DEFAULT 'INR',
  status                TEXT NOT NULL DEFAULT 'created', -- created, authorized, captured, failed, refunded
  raw_webhook_payload   JSONB, -- store for audit/dispute resolution; never expose to frontend
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_payments_user ON payments(user_id, created_at DESC);
-- Security: subscription activation logic must read status from THIS table
-- (post webhook signature verification) — never from a client-supplied flag.

CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id      UUID UNIQUE NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  invoice_number  TEXT UNIQUE NOT NULL,
  amount_inr      NUMERIC(10,2) NOT NULL,
  tax_inr         NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_inr       NUMERIC(10,2) NOT NULL,
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  pdf_url         TEXT
);

-- ============================================================
-- CONTENT: COURSES & VIDEOS
-- ============================================================

CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  description TEXT
);

CREATE TABLE courses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT NOT NULL,
  slug                TEXT UNIQUE NOT NULL,
  description         TEXT,
  category_id         UUID REFERENCES categories(id) ON DELETE SET NULL,
  instructor_id       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  is_premium          BOOLEAN NOT NULL DEFAULT false,
  required_plan_code  TEXT NOT NULL DEFAULT 'FREE', -- FK-by-convention to subscription_plans.code
  thumbnail_url       TEXT,
  status              TEXT NOT NULL DEFAULT 'draft', -- draft, published, archived
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);
CREATE TRIGGER trg_courses_updated_at BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_courses_category ON courses(category_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_courses_instructor ON courses(instructor_id) WHERE deleted_at IS NULL;

CREATE TABLE videos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id           UUID REFERENCES courses(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  slug                TEXT NOT NULL,
  description         TEXT,
  duration_seconds    INTEGER NOT NULL DEFAULT 0,
  storage_url         TEXT NOT NULL, -- never served directly; always via signed CDN URL
  thumbnail_url       TEXT,
  is_premium          BOOLEAN NOT NULL DEFAULT false,
  required_plan_code  TEXT NOT NULL DEFAULT 'FREE',
  order_index         INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'draft',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ,
  UNIQUE(course_id, slug)
);
CREATE TRIGGER trg_videos_updated_at BEFORE UPDATE ON videos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_videos_course_order ON videos(course_id, order_index) WHERE deleted_at IS NULL;

CREATE TABLE video_progress (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id          UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  position_seconds  INTEGER NOT NULL DEFAULT 0,
  completed         BOOLEAN NOT NULL DEFAULT false,
  completed_at      TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, video_id)
);
CREATE TRIGGER trg_video_progress_updated_at BEFORE UPDATE ON video_progress
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_progress_user ON video_progress(user_id);

-- ============================================================
-- DOWNLOADS (server-authorized, quota-enforced)
-- ============================================================

CREATE TABLE downloads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id         UUID NOT NULL REFERENCES videos(id) ON DELETE RESTRICT,
  status           TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, failed
  file_size_bytes  BIGINT,
  ip_address       INET NOT NULL,
  device           TEXT,
  browser          TEXT,
  plan_code_used   TEXT NOT NULL, -- snapshot at request time, for accurate audit even after plan changes
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ
);
CREATE INDEX idx_downloads_user_date ON downloads(user_id, requested_at DESC);

-- Separate from `downloads` specifically so quota checks are a single
-- indexed upsert under a transaction, not a COUNT() over full history.
CREATE TABLE download_quota (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quota_date     DATE NOT NULL,
  downloads_used INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, quota_date)
);
-- Application pattern for race-condition-safe increment:
--   INSERT INTO download_quota (user_id, quota_date, downloads_used)
--   VALUES ($1, CURRENT_DATE, 1)
--   ON CONFLICT (user_id, quota_date)
--   DO UPDATE SET downloads_used = download_quota.downloads_used + 1
--   WHERE download_quota.downloads_used < $2  -- $2 = plan limit
--   RETURNING *;
-- If no row is returned, quota is exhausted — reject before creating the download record.

-- ============================================================
-- LIVE MEETINGS
-- ============================================================

CREATE TABLE meetings (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id            UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title              TEXT NOT NULL,
  room_code          TEXT UNIQUE NOT NULL, -- short human-shareable join code
  type               TEXT NOT NULL DEFAULT 'group', -- one_to_one, group
  status             TEXT NOT NULL DEFAULT 'scheduled', -- scheduled, live, ended, locked
  max_participants   INTEGER NOT NULL DEFAULT 50,
  is_locked          BOOLEAN NOT NULL DEFAULT false,
  recording_enabled  BOOLEAN NOT NULL DEFAULT false,
  scheduled_at       TIMESTAMPTZ,
  started_at         TIMESTAMPTZ,
  ended_at           TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_meetings_host ON meetings(host_id);
CREATE INDEX idx_meetings_status ON meetings(status);

CREATE TABLE meeting_participants (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id           UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant_role     TEXT NOT NULL DEFAULT 'participant', -- host, co_host, participant
  joined_at            TIMESTAMPTZ,
  left_at              TIMESTAMPTZ,
  mic_state            TEXT NOT NULL DEFAULT 'off',
  camera_state         TEXT NOT NULL DEFAULT 'off',
  connection_quality   TEXT, -- good, fair, poor — updated via signaling heartbeat, not persisted per-frame
  is_muted_by_host     BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(meeting_id, user_id)
);
CREATE INDEX idx_participants_meeting ON meeting_participants(meeting_id);

CREATE TABLE meeting_permissions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id       UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  can_share_screen BOOLEAN NOT NULL DEFAULT true,
  can_chat         BOOLEAN NOT NULL DEFAULT true,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(meeting_id, user_id)
);

CREATE TABLE chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id  UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  content     TEXT NOT NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_meeting_time ON chat_messages(meeting_id, sent_at);

CREATE TABLE shared_files (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id  UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  file_url    TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  file_size   BIGINT,
  shared_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE recordings (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id         UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  storage_url        TEXT,
  consent_confirmed  BOOLEAN NOT NULL DEFAULT false, -- must be true before recording starts
  started_at         TIMESTAMPTZ,
  ended_at           TIMESTAMPTZ,
  status             TEXT NOT NULL DEFAULT 'not_started' -- not_started, recording, processing, ready, failed
);

-- ============================================================
-- COMMUNITY & MODERATION
-- ============================================================

CREATE TABLE comments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id           UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_id            UUID REFERENCES users(id) ON DELETE SET NULL, -- null if author account deleted
  parent_comment_id  UUID REFERENCES comments(id) ON DELETE SET NULL, -- see ERD note: soft-delete, not cascade
  content            TEXT NOT NULL,
  original_language  TEXT NOT NULL DEFAULT 'en',
  is_edited          BOOLEAN NOT NULL DEFAULT false,
  edited_at          TIMESTAMPTZ,
  status             TEXT NOT NULL DEFAULT 'visible', -- visible, hidden, deleted
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_video ON comments(video_id, created_at DESC);
CREATE INDEX idx_comments_parent ON comments(parent_comment_id);

CREATE TABLE comment_likes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id  UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote_type   TEXT NOT NULL, -- like, dislike
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

CREATE TABLE comment_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id  UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL, -- spam, harassment, offensive, other
  status      TEXT NOT NULL DEFAULT 'pending', -- pending, reviewed, dismissed
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(comment_id, reporter_id) -- prevents duplicate reports from the same user
);

CREATE TABLE moderation_actions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type  TEXT NOT NULL, -- comment, user, video
  target_id    UUID NOT NULL,
  action       TEXT NOT NULL, -- hidden, deleted, warned, banned, dismissed
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL, -- null = automated system action
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_moderation_target ON moderation_actions(target_type, target_id);

-- ============================================================
-- SECURITY & AUDIT
-- ============================================================

CREATE TABLE login_attempts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  email_attempted TEXT NOT NULL, -- kept even on failure/unknown-user for rate-limit analysis
  ip_address     INET NOT NULL,
  browser        TEXT,
  browser_version TEXT,
  os             TEXT,
  device_type    TEXT,
  device_model   TEXT,
  city           TEXT,  -- IP-derived approximation only — never presented as exact location
  state          TEXT,
  country        TEXT,
  success        BOOLEAN NOT NULL,
  otp_verified   BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_attempts_user_time ON login_attempts(user_id, created_at DESC);
CREATE INDEX idx_login_attempts_ip_time ON login_attempts(ip_address, created_at DESC); -- rate limiting

CREATE TABLE otp_verifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel      TEXT NOT NULL, -- email, sms
  otp_hash     TEXT NOT NULL, -- never store the OTP in plaintext
  purpose      TEXT NOT NULL, -- login, registration, password_reset
  expires_at   TIMESTAMPTZ NOT NULL,
  verified_at  TIMESTAMPTZ,
  attempts     INTEGER NOT NULL DEFAULT 0, -- lock after N failed attempts
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_otp_user_purpose ON otp_verifications(user_id, purpose, created_at DESC);

CREATE TABLE trusted_devices (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_fingerprint   TEXT NOT NULL,
  browser              TEXT,
  os                   TEXT,
  trusted_until        TIMESTAMPTZ NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, device_fingerprint)
);

CREATE TABLE sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token_hash  TEXT UNIQUE NOT NULL, -- store hash, never the raw token
  ip_address          INET,
  device_info         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ NOT NULL,
  revoked_at          TIMESTAMPTZ
);
CREATE INDEX idx_sessions_user_active ON sessions(user_id) WHERE revoked_at IS NULL;

CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE is_read = false;

CREATE TABLE audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     UUID REFERENCES users(id) ON DELETE SET NULL, -- null = system action
  action       TEXT NOT NULL, -- e.g. 'subscription.upgraded', 'video.deleted', 'user.suspended'
  target_type  TEXT,
  target_id    UUID,
  metadata     JSONB, -- structured diff/context; never include secrets or password hashes
  ip_address   INET,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_actor_time ON audit_logs(actor_id, created_at DESC);
CREATE INDEX idx_audit_target ON audit_logs(target_type, target_id);

-- ============================================================
-- End of Day 1 schema.
-- Retention note: login_attempts, audit_logs, and download records
-- are append-only and should be partitioned by month once volume
-- grows — not required for the 15-day build, flagged for later.
-- ============================================================
