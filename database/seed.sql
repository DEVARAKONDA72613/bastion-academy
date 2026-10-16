-- ============================================================
-- Bastion Academy — Seed Data (Day 1)
-- Run after schema.sql. Passwords below are placeholder hashes —
-- replace with real argon2id output from your auth module.
-- ============================================================

INSERT INTO roles (name, description) VALUES
  ('free', 'Default role for all new registrations'),
  ('bronze', 'Paid tier — Operator'),
  ('silver', 'Paid tier — Specialist'),
  ('gold', 'Paid tier — Commander'),
  ('instructor', 'Can publish courses and host live rooms'),
  ('admin', 'Full platform access');

INSERT INTO subscription_plans (code, name, price_inr, billing_period_days, streaming_quality, download_daily_limit, live_room_access, premium_track_access) VALUES
  ('FREE',   'Recruit',    0,    30, '720p',  1,  'observer', 'none'),
  ('BRONZE', 'Operator',   499,  30, '1080p', 5,  'join',     'limited'),
  ('SILVER', 'Specialist', 999,  30, '1080p', 15, 'join',     'all'),
  ('GOLD',   'Commander',  1999, 30, '4k',    -1, 'host',     'all_early');

INSERT INTO users (id, email, password_hash, role_id, status, email_verified_at)
SELECT '11111111-1111-1111-1111-111111111111', 'arjun.mehta@bastion.academy', '$argon2id$placeholder$instructor', id, 'active', now()
FROM roles WHERE name = 'instructor';

INSERT INTO users (id, email, password_hash, role_id, status, email_verified_at)
SELECT '22222222-2222-2222-2222-222222222222', 'priya.s@example.com', '$argon2id$placeholder$student', id, 'active', now()
FROM roles WHERE name = 'bronze';

INSERT INTO users (id, email, password_hash, role_id, status, email_verified_at)
SELECT '33333333-3333-3333-3333-333333333333', 'rohan.k@example.com', '$argon2id$placeholder$student', id, 'active', now()
FROM roles WHERE name = 'free';

INSERT INTO users (id, email, password_hash, role_id, status, email_verified_at)
SELECT '44444444-4444-4444-4444-444444444444', 'admin@bastion.academy', '$argon2id$placeholder$admin', id, 'active', now()
FROM roles WHERE name = 'admin';

INSERT INTO profiles (user_id, display_name, country, state, city, preferred_language) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Arjun Mehta', 'India', 'Karnataka', 'Bengaluru', 'en'),
  ('22222222-2222-2222-2222-222222222222', 'Priya S.', 'India', 'Tamil Nadu', 'Chennai', 'en'),
  ('33333333-3333-3333-3333-333333333333', 'Rohan K.', 'India', 'Maharashtra', 'Pune', 'hi'),
  ('44444444-4444-4444-4444-444444444444', 'Platform Admin', 'India', 'Karnataka', 'Bengaluru', 'en');

INSERT INTO user_subscriptions (user_id, plan_id, status, expires_at)
SELECT '22222222-2222-2222-2222-222222222222', id, 'active', now() + interval '30 days'
FROM subscription_plans WHERE code = 'BRONZE';

INSERT INTO user_subscriptions (user_id, plan_id, status, expires_at)
SELECT '33333333-3333-3333-3333-333333333333', id, 'active', NULL
FROM subscription_plans WHERE code = 'FREE';

INSERT INTO categories (name, slug, description) VALUES
  ('Cloud Security', 'cloud-security', 'IAM, workload, and infrastructure security across AWS, GCP, and Azure'),
  ('Incident Response', 'incident-response', 'Detection, triage, and response fundamentals for SOC teams');

INSERT INTO courses (id, title, slug, description, category_id, instructor_id, is_premium, required_plan_code, status)
SELECT
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Cloud Security Fundamentals',
  'cloud-security-fundamentals',
  'A practical, hands-on introduction to securing IAM, storage, and network boundaries in modern cloud environments.',
  c.id,
  '11111111-1111-1111-1111-111111111111',
  true, 'BRONZE', 'published'
FROM categories c WHERE c.slug = 'cloud-security';

INSERT INTO videos (id, course_id, title, slug, description, duration_seconds, storage_url, is_premium, required_plan_code, order_index, status)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'Understanding the Shared Responsibility Model', 'shared-responsibility-model',
   'What your cloud provider secures, what you secure, and where teams get this wrong.',
   1380, 's3://bastion-videos/csf/01-shared-responsibility.mp4', false, 'FREE', 1, 'published'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'IAM Privilege Escalation Paths', 'iam-privilege-escalation-paths',
   'How overly broad IAM policies chain together into real escalation paths, with live examples.',
   2470, 's3://bastion-videos/csf/07-iam-privesc.mp4', true, 'BRONZE', 7, 'published');

INSERT INTO video_progress (user_id, video_id, position_seconds, completed)
VALUES ('22222222-2222-2222-2222-222222222222', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 862, false);

INSERT INTO meetings (id, host_id, title, room_code, type, status, max_participants, recording_enabled, scheduled_at)
VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111',
  'Threat Briefing: CVE-2026-4417 walkthrough', 'BASTION-4417', 'group', 'scheduled', 50, true, now() + interval '3 days');

INSERT INTO comments (id, video_id, user_id, content, original_language)
VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '33333333-3333-3333-3333-333333333333', 'Does this apply to GCP IAM bindings too, or is this AWS-specific?', 'en');
