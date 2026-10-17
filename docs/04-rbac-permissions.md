# Bastion Academy â€” RBAC implementation status

This document describes the current authorization policy. Protected API
routes require authentication, and meeting moderation must be enforced by
the backend for each specific meeting.

## Authorization components

- `backend/src/core/permissions.ts` exports `can(subject, action, resource?)`.
- `backend/src/middleware/auth.ts` authenticates REST requests using the
  session cookie.
- `backend/src/core/subject.ts` loads the user's role and active plan.
- Feature services perform additional ownership and meeting-specific checks.
- Frontend visibility is not an authorization boundary.

## Current permission policy

| Action | Current behavior |
|---|---|
| Any action for `admin` | Allowed by the helper's admin override |
| `video.watch` | Requires the plan rank to meet `requiredPlan`, except for explicitly enabled instructor content access |
| `video.download` | Allowed by the helper; the download service enforces the subscription quota |
| `course.create`, `course.edit`, `course.video.upload` | Requires instructor role and ownership |
| `meeting.host` | All authenticated plan tiers may create meetings |
| `meeting.join` | All authenticated plan tiers may join meetings |
| `meeting.moderate` | Meeting services must validate the current host/co-host role and target participant |
| `comment.moderate`, `user.manage`, `analytics.platform` | Denied to non-admin subjects |
| Unknown action | Denied to non-admin subjects |

## Live meeting policy

Free, Bronze, Silver, and Gold users may create one-to-one and group
meetings and join meetings using a room code.

Creating a meeting assigns the creator the host role. Host/co-host
moderation controls remain restricted to the appropriate room roles.
Plan-based download quotas and premium video access are not changed by
this meeting policy.

Every join request must be authenticated, the room must exist, and the
backend must enforce capacity, lock state, and removed-participant rules.

## Remaining security work

- Socket.IO must validate room membership for every signaling, media,
  chat, and moderation event, not just the initial join.
- Production meeting traffic needs testing across separate browser
  sessions and network conditions.
- Email and translation adapters remain mock implementations.
- The meeting recording feature tracks consent and recording intent; it
  does not capture or store media.
- The existing unit tests cover selected permission decisions, not every
  HTTP route or Socket.IO event.

## Adding protected behavior

1. Define the permission and resource requirements.
2. Enforce authorization in the backend.
3. Add tests for allowed and denied cases.
4. Update this document and the API contract to reflect implemented behavior.