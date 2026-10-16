# Bastion Academy — RBAC implementation status

This document describes authorization behavior currently present in the
backend. It is not a complete policy matrix for every product feature.
Frontend visibility is not an authorization boundary; API and Socket.IO access
must be enforced by the backend.

## Authorization components

- `backend/src/core/permissions.ts` exports `can(subject, action, resource?)`.
- `backend/src/middleware/auth.ts` authenticates REST requests from the
  session cookie and exposes `requireRole`, `requireAdmin`, and `requirePlan`.
- `backend/src/core/subject.ts` loads the user's role and current subscription
  plan from PostgreSQL.
- Feature services perform additional ownership and meeting-specific checks.
- The frontend does not import or enforce the backend permission helper.

## Current `can()` behavior

| Action | Current behavior |
|---|---|
| Any action for `admin` | Allowed by the helper's admin override |
| `video.watch` | Allowed when the plan rank meets `requiredPlan`; instructors may also pass if `instructorContentAccess` is true |
| `video.download` | Allowed by the helper; plan quota is applied separately in the download service |
| `course.create`, `course.edit`, `course.video.upload` | Requires instructor role and `resource.ownerId === subject.id` |
| `meeting.host` | Instructor role or GOLD plan |
| `meeting.join` | Any non-FREE plan or instructor role |
| `meeting.moderate` | Allowed for any non-admin subject by this helper; meeting service checks must provide the actual authorization |
| `comment.moderate`, `user.manage`, `analytics.platform` | Denied to non-admin subjects |
| Any unknown action | Denied to non-admin subjects |

Route middleware can impose additional checks. For example, the admin router
requires both authentication and admin role. The instructor course-creation
route uses instructor-role middleware; the course PATCH route checks ownership
but currently returns 501.

## Policy gaps to close

- The documented `instructor_content_access` flag is not present in the
  database schema or loaded by `loadSubject()`. Therefore instructor premium
  access through this flag is not currently available in normal requests.
- The role/plan matrix previously described observer-only FREE meeting access
  and analytics/payment/security permissions not represented in `can()`. Treat
  those entries as product intent until implemented and tested at each route.
- `meeting.moderate` is permissive for non-admins in the helper. Every host or
  co-host action must be verified in its service using the meeting's current
  participant roles; do not rely on the helper alone.
- Socket.IO performs a membership check for `meeting:join`, but current event
  handlers do not uniformly authorize membership for every chat, signaling,
  and media-state action. Complete those checks before production use.
- The permission unit tests cover selected helper decisions only. They do not
  prove complete authorization coverage across REST routes or socket events.

## Required approach for new protected behavior

1. Define the action and resource checks in the backend, including ownership
   and current plan/role data where required.
2. Enforce authorization in every relevant HTTP route and Socket.IO event
   handler; hiding a frontend control is not sufficient.
3. Add focused tests for allowed and denied cases, including cross-user
   resource access and stale/revoked account state.
4. Update this document and `docs/03-api-contract.md` when the implemented
   behavior changes.
