# Bastion Academy backend

The backend is a Node.js/TypeScript Express application with PostgreSQL and
Socket.IO. It currently implements the core authentication, user, course/video,
download, subscription/payment, meeting, comment, and admin flows. The API is
partially implemented: see [the API contract](../docs/03-api-contract.md) for
implemented endpoints and known gaps.

## Layout

```text
src/
  core/         Shared database, permissions, session, audit, OTP and provider logic
  middleware/   Authentication and role/plan checks
  modules/      Feature routes and services
  tests/        Unit tests for permissions, moderation and theme logic
scripts/        Migration, seed and quota-race test scripts
```

## Setup

From this directory:

```powershell
npm install
Copy-Item .env.example .env
# Set DATABASE_URL and the other required values in .env.
npm run migrate
npm run seed
npm run dev
```

The migration runner reads the numbered SQL files in `../database/migrations`.
The seed runner applies `../database/seed.sql`. The development server listens
on port 4000 by default; `GET http://localhost:4000/health` returns
`{"status":"ok"}`.

Do not overwrite an applied migration. Add a new numbered migration for schema
changes. Keep real credentials in `.env`; do not commit or share that file.

## Implemented and incomplete areas

- The API, database pool/transaction helper, session-cookie authentication,
  permission checks, OTP flow, subscription services, and feature modules have
  working code; this is not a 501-only scaffold.
- `PATCH /api/v1/instructor/courses/:id` is still a 501 stub. Video upload and
  edit routes are not implemented.
- Email and translation integrations are mock-only unless a supported provider
  adapter is added. Video delivery returns a marked mock response until real
  storage/CDN configuration is wired. Razorpay requires valid test credentials
  and a reachable webhook URL to exercise end-to-end.
- Meetings use Socket.IO signaling with peer-to-peer WebRTC media. The room
  coordination map is in process memory; multi-instance deployment requires a
  shared Socket.IO adapter. No SFU/media recording pipeline is included.

## Checks

```powershell
npm test
npm run build
```

`npm run test:quota-race` is an integration test that requires a migrated and
seeded PostgreSQL database configured through `DATABASE_URL`. It issues
concurrent download requests for the seeded FREE account.
