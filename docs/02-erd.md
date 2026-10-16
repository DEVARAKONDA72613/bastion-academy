# Bastion Academy — Entity Relationship Diagram

```mermaid
erDiagram
  ROLES ||--o{ USERS : "assigned to"
  USERS ||--|| PROFILES : has
  USERS ||--o{ USER_SUBSCRIPTIONS : subscribes
  SUBSCRIPTION_PLANS ||--o{ USER_SUBSCRIPTIONS : "defines"
  USERS ||--o{ PAYMENTS : makes
  USER_SUBSCRIPTIONS ||--o{ PAYMENTS : "linked from"
  PAYMENTS ||--o| INVOICES : generates

  CATEGORIES ||--o{ COURSES : groups
  USERS ||--o{ COURSES : "instructs (host)"
  COURSES ||--o{ VIDEOS : contains
  USERS ||--o{ VIDEO_PROGRESS : tracks
  VIDEOS ||--o{ VIDEO_PROGRESS : "progress on"

  USERS ||--o{ DOWNLOADS : requests
  VIDEOS ||--o{ DOWNLOADS : "downloaded as"
  USERS ||--o{ DOWNLOAD_QUOTA : "daily quota"

  USERS ||--o{ MEETINGS : hosts
  MEETINGS ||--o{ MEETING_PARTICIPANTS : has
  USERS ||--o{ MEETING_PARTICIPANTS : joins
  MEETINGS ||--o{ MEETING_PERMISSIONS : grants
  MEETINGS ||--o{ CHAT_MESSAGES : contains
  MEETINGS ||--o{ SHARED_FILES : contains
  MEETINGS ||--o{ RECORDINGS : produces

  VIDEOS ||--o{ COMMENTS : has
  USERS ||--o{ COMMENTS : writes
  COMMENTS ||--o{ COMMENTS : "replies to (self)"
  COMMENTS ||--o{ COMMENT_LIKES : receives
  COMMENTS ||--o{ COMMENT_REPORTS : flagged_by
  USERS ||--o{ MODERATION_ACTIONS : "performed by"

  USERS ||--o{ LOGIN_ATTEMPTS : "attempted by"
  USERS ||--o{ OTP_VERIFICATIONS : verifies
  USERS ||--o{ TRUSTED_DEVICES : trusts
  USERS ||--o{ SESSIONS : "logged into"
  USERS ||--o{ NOTIFICATIONS : receives
  USERS ||--o{ AUDIT_LOGS : "acted by"
```

## Notes on key relationships

- **users → roles**: many-to-one, since a role (Free/Bronze/Silver/Gold/Instructor/Admin) is a coarse permission tier; plan-level entitlements live in `user_subscriptions`, not on the role itself, so a user's *plan* can change without their *role* changing (an Instructor is still an Instructor whether or not they personally subscribe to Gold).
- **user_subscriptions → payments**: `payments.user_subscription_id` is nullable, so a Free-plan subscription can have no linked payment. The current schema does not make this FK unique, so it permits multiple payment rows to reference one subscription.
- **meetings → recordings**: the schema permits multiple recording rows per meeting; it does not enforce the one-recording-per-meeting cardinality. Media capture/storage is not implemented yet.
- **comments → comments (self-referencing)**: `parent_comment_id` nullable; deleting a parent with replies soft-deletes it (`status = 'deleted'`, content replaced with a tombstone) rather than cascading, so replies remain readable — this is the Section 10 edge case ("deleted parent comment with replies").
- **download_quota** is a separate table from `downloads` (the audit log) specifically so the quota check is a single indexed row lookup/upsert under a transaction, rather than a `COUNT()` over the full downloads history — this is what makes the race-condition protection in Section 5 practical.
