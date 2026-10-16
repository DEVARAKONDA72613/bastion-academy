# Bastion Academy — Testing status and plan

This document separates checks that are present in the repository from
untested scenarios and recommended follow-up. A service implementation by
itself is not evidence that an edge case has an automated test.

## Checks currently available

From `backend/`:

```powershell
npm test
npm run build
npm run test:quota-race
```

- `npm test` runs Node tests via `tsx` for the permission helper, comment
  moderation helpers, and IST theme boundaries. These are unit tests; they do
  not exercise HTTP routes, PostgreSQL-backed services, or browser behavior.
- `npm run build` type-checks/compiles the backend.
- `npm run test:quota-race` exercises concurrent download requests against
  PostgreSQL. It requires `DATABASE_URL`, applied migrations and seed data,
  including the expected seeded FREE user and at least one course. Use a
  disposable test database: the script removes that user's current-day quota
  and download rows as part of setup/cleanup.

From the repository root, the PowerShell scripts in `testing-scripts/` provide
manual auth and download flows. They expect the development backend and mock
email OTP output; the download script expects the seeded video/account setup
described in its comments.

## Existing test coverage

| Area | What is exercised now | What is not established by the current suite |
|---|---|---|
| Permissions | Selected plan/role/ownership decisions and deny-by-default helper | Complete endpoint-by-endpoint authorization |
| Moderation | Selected comment validation/flagging and flood helper behavior | Full comment/report lifecycle against PostgreSQL |
| Theme | Selected IST light/dark boundary times | Browser persistence/first-render behavior |
| Downloads | Concurrent quota update with real database, via separate integration script | HTTP authentication, real file delivery, failure recovery |
| Authentication | Manual PowerShell walkthrough | Automated tests for OTP expiry/attempt limits, password reset, suspension, or revoked sessions |
| Payments | Webhook logic includes row locking for duplicate captured-event idempotency; no automated webhook/payment integration test is configured | Signature failures, mismatched amount/currency, retries under concurrency, failure/capture ordering, rollback/reconciliation |
| Meetings | Socket handlers now guard room membership and apply host/co-host permissions; no automated route/socket integration test is configured | Permission bypass attempts, co-host/host boundary, capacity/lock races, reconnect/disconnect, file data channels and multi-client WebRTC |
| Frontend | No frontend test suite is configured; latest UI patch not build-verified | Component/page behavior, 360–430px mobile widths, tablet widths, keyboard/screen-reader use, resume/CC/hover preview, invoice print, camera/screen permissions and concurrent live sessions |

## Recommended next integration tests

1. **Authentication/session:** unknown user and wrong password, OTP expiry and
   attempt limit, password reset, revoked session, suspended account with an
   existing session, and session revocation ownership.
2. **Payments:** invalid webhook signature; captured payment amount/currency
   mismatch; repeated captured event; failed payment; invoice/subscription
   atomicity. Run against a test database and Razorpay test configuration.
3. **Meeting authorization:** non-participant attempts to send chat, signaling,
   or media-state events; host/co-host actions; locked/full room; reconnect and
   multiple sockets per user.
4. **Downloads:** quota exhaustion and concurrent requests through the HTTP
   route; URL-generation failure after authorization; duplicate request
   behavior and audit status.
5. **Frontend:** run `npm run build` in `frontend/`; test loading/error/empty states, session expiry, keyboard/screen-reader interaction, 360px mobile and tablet widths, download quota messaging, invoice print, player resume/CC/next countdown and two-user live-room workflows.
6. **Live room:** in two browser windows with different accounts, verify join, host/co-host mute/remove, rejoin after refresh/network interruption, lock and capacity, hand raise, RTT labels, camera switch, screen share, chat permission, peer-to-peer files and end-for-all. Confirm the recording UI explicitly remains an intent flag and does not capture media.

## Infrastructure-backed/manual checks

- Exercise Razorpay checkout with test credentials and a reachable webhook
  endpoint; verify the database state and repeated-event behavior.
- Test WebRTC with at least two real browser clients and more than one network
  where possible. Current peer-to-peer media and in-memory signaling do not
  validate SFU or multi-instance behavior.
- Test real object storage/CDN delivery and deployment configuration after
  those integrations exist.

## Latest patch execution status

The source was parsed with the globally available TypeScript transpiler (syntax-only). `tsc -p frontend/tsconfig.json --noEmit` and `tsc -p backend/tsconfig.json --noEmit` could not complete because package/type dependencies were absent. Attempted `npm ci` stalled while resolving the npm registry, and direct registry resolution failed in this environment. These are environment blockers, not passing build/test results. Restore dependencies locally and execute the commands above before submission.
