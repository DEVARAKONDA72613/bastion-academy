# Bastion Academy — API surface

This is an inventory of the routes currently mounted by the backend, not a
claim that every planned product endpoint is implemented. Base path:
`/api/v1`.

## Authentication and request handling

- Browser authentication uses the `session_token` httpOnly cookie.
- Bearer-token/`Authorization` authentication is not implemented.
- The Express app has a global IP-based rate limit; auth routes have a stricter
  additional limit, and OTP endpoints have a tighter limit as well. Limits are
  not currently tracked per authenticated user.
- Request schemas are validated per route where present; validation is not
  uniformly applied to every endpoint.
- Access labels below describe route middleware. Services may perform
  additional ownership, subscription, or meeting-participant checks.

## Auth

| Method & path | Access | Current behavior |
|---|---|---|
| POST `/auth/register` | Public | Register and send registration OTP |
| POST `/auth/verify-otp` | Public | Verify registration or login OTP |
| POST `/auth/login` | Public | Check credentials; trusted devices may log in directly, otherwise require OTP |
| POST `/auth/logout` | Auth | Revoke current session and clear cookie |
| POST `/auth/forgot-password` | Public | Send reset OTP without revealing whether the email exists |
| POST `/auth/reset-password` | Public | Reset password using OTP |
| POST `/auth/resend-otp` | Public | Resend registration, login or reset OTP |
| POST `/auth/trust-device` | Auth | Trust the current browser/device fingerprint |

## Users and security

| Method & path | Access | Current behavior |
|---|---|---|
| GET `/users/me` | Auth | Current user, profile and subscription plan |
| PATCH `/users/me` | Auth | Update supported profile fields |
| PATCH `/users/me/theme` | Auth | Update theme preference |
| GET `/users/me/security/sessions` | Auth | List the user's sessions |
| DELETE `/users/me/security/sessions/:id` | Auth | Revoke an owned session |
| GET `/users/me/security/login-history` | Auth | Paginated login history |
| GET `/users/me/security/trusted-devices` | Auth | List trusted devices |
| DELETE `/users/me/security/trusted-devices/:id` | Auth | Remove an owned trusted device |

## Courses and videos

| Method & path | Access | Current behavior |
|---|---|---|
| GET `/courses` | Public | List published courses |
| GET `/courses/:slug` | Public | Course details with lock state for videos |
| GET `/videos/:id` | Auth | Video metadata subject to plan access |
| GET `/videos/:id/stream-url` | Auth | Stream URL response; currently mock until storage/CDN is integrated |
| POST `/videos/:id/progress` | Auth | Save watch position/completion |
| GET `/courses/:id/progress` | Auth | Course progress summary |
| POST `/instructor/courses` | Instructor | Create a draft course |
| PATCH `/instructor/courses/:id` | Instructor | **Stub: returns 501 after ownership check** |

Instructor video upload/edit routes are not present. The API contract does not
currently expose the planned `POST /instructor/courses/:id/videos` or
`PATCH /instructor/videos/:id` endpoints.

## Downloads

| Method & path | Access | Current behavior |
|---|---|---|
| POST `/downloads` | Auth | Authorize a video download, apply quota and return the service result |
| GET `/downloads` | Auth | List the user's recent download history |
| GET `/downloads/quota` | Auth | Return today's quota usage |

The quota update is transaction-protected. The current service records a
download before returning the stream URL; delivery/storage is not yet a
production CDN flow.

## Subscriptions and billing

| Method & path | Access | Current behavior |
|---|---|---|
| GET `/plans` | Public | List active plans |
| GET `/subscriptions/me` | Auth | Return the current active subscription |
| POST `/subscriptions/checkout` | Auth | Create a Razorpay order and pending payment row |
| POST `/webhooks/razorpay` | Public; signature verified | Process supported Razorpay payment events |
| POST `/subscriptions/cancel` | Auth | Disable auto-renew on active subscriptions |
| GET `/billing/invoices` | Auth | List the user's invoices |
| GET `/billing/invoices/:id` | Auth | Fetch an owned invoice |

Only a verified captured-payment webhook activates a subscription. Payment
webhook retry/idempotency behavior still needs integration coverage.

## Meetings

All listed REST routes require authentication; service methods apply
meeting-specific checks.

| Method & path | Access | Current behavior |
|---|---|---|
| POST `/meetings` | Auth | Create meeting; service enforces host entitlement |
| POST `/meetings/:roomCode/join` | Auth | Join by room code; service checks access, lock and capacity |
| GET `/meetings/history` | Auth | List the user's meeting history |
| GET `/meetings/:id` | Auth | Fetch a participant's meeting snapshot |
| POST `/meetings/:id/lock` | Auth | Lock meeting subject to host permission |
| POST `/meetings/:id/unlock` | Auth | Unlock meeting subject to host permission |
| POST `/meetings/:id/participants/:userId/mute` | Auth | Mute participant subject to host/co-host permission |
| POST `/meetings/:id/participants/:userId/remove` | Auth | Remove participant subject to host/co-host permission |
| POST `/meetings/:id/participants/:userId/co-host` | Auth | Grant/revoke co-host subject to host permission |
| POST `/meetings/:id/recording/start` | Auth | Record consent state; media capture/storage is not implemented |

Socket.IO authenticates the handshake using the session cookie. Current event
names include `meeting:join`, `meeting:offer`, `meeting:answer`,
`meeting:ice-candidate`, `meeting:chat`, `meeting:raise-hand`, and
`meeting:media-state`. The server emits participant, hand-raised, chat and
error events. Authorization and membership checks for every event are not yet
uniformly implemented; do not treat signaling as production-hardened.

## Comments

| Method & path | Access | Current behavior |
|---|---|---|
| GET `/videos/:id/comments` | Public | Paginated comments with sorting |
| GET `/comments/:id/replies` | Public | List replies |
| POST `/videos/:id/comments` | Auth | Post a comment/reply through moderation logic |
| PATCH `/comments/:id` | Auth | Edit own comment |
| DELETE `/comments/:id` | Auth | Delete own comment or admin-delete |
| POST `/comments/:id/like` | Auth | Set like/dislike vote |
| POST `/comments/:id/translate` | Auth | Request translation; real translation provider is not configured |
| POST `/comments/:id/report` | Auth | Report a comment |

## Admin

All admin routes require an authenticated admin role.

| Method & path | Current behavior |
|---|---|
| GET `/admin/users` | Search/list users |
| PATCH `/admin/users/:id/status` | Change user status |
| GET `/admin/payments` | List payments |
| GET `/admin/subscriptions` | List subscriptions |
| GET `/admin/downloads` | List download records |
| GET `/admin/comments/reports` | List comment reports |
| POST `/admin/comments/:id/moderate` | Moderate a comment |
| GET `/admin/meetings` | List meetings |
| GET `/admin/security/login-attempts` | List login attempts |
| GET `/admin/audit-logs` | List audit logs |

## Not currently exposed

There are no notification routes, platform analytics routes, public bearer
authentication, or instructor video upload/edit routes in the mounted API.
Those remain future work rather than part of the implemented contract.
