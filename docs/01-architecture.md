# Bastion Academy — Technical Architecture

This document records the technology in the repository today and distinguishes
it from planned production infrastructure.

## Implemented stack

### Frontend

**Next.js 14, React 18, TypeScript and Tailwind CSS.** The app uses the Next.js
App Router. Client-side API calls go directly to the Express API using
`credentials: 'include'`; there is currently no Next.js API-route BFF. The root
page redirects to login, and the application pages are an early, partial UI.

### Backend

**Node.js, Express 4 and TypeScript**, organized into feature modules with
shared logic under `backend/src/core`. Express mounts the REST API under
`/api/v1`. Socket.IO shares the HTTP server for meeting signaling.

### Database

**PostgreSQL** via `pg`. Migrations are versioned SQL files under
`database/migrations`; service operations use transactions for workflows such
as download quota updates and payment activation. Deployment, pooling and
backups are not configured by this repository.

### Authentication and permissions

Authentication uses opaque random session tokens stored as hashes in
PostgreSQL and delivered in an httpOnly cookie. Passwords use Argon2. The
backend currently authenticates REST and Socket.IO connections using this
session; JWT bearer authentication is not implemented. The permission helper
centralizes selected plan and action decisions, with role checks also used by
route middleware.

### Meetings

Socket.IO relays signaling and meeting events; WebRTC carries peer media
directly between browsers. The current server stores its meeting-to-socket map
in process memory, so this design requires a single backend instance unless a
shared Socket.IO adapter is added. There is no SFU or media-recording pipeline
in the repository. A mediasoup/LiveKit SFU or managed alternative is a future
production option, not a configuration-only feature currently available.

### Storage and media

No S3-compatible storage or CDN integration is implemented. Video stream
responses are explicitly marked as mock until real signed URL generation is
connected. The frontend displays a public sample video for that mock response.

### Payments

The backend uses Razorpay Orders and webhook signature verification. A
subscription is activated by the payment-captured webhook handler, not by the
browser checkout callback. End-to-end payment verification still requires
Razorpay test credentials and a reachable webhook endpoint.

### Email, OTP and translation

Provider interfaces exist for email and translation, but there is no real
provider adapter configured in this repository. The default email behavior is
a development mock; unsupported non-mock provider names fail explicitly.

## Planned production work

- Configure managed PostgreSQL, operational backups and deployment secrets.
- Integrate durable object storage/CDN and production signed media URLs.
- Add a shared Socket.IO adapter for horizontally scaled signaling; evaluate
  an SFU or managed real-time provider for larger rooms.
- Integrate real email/translation providers and verify the payment lifecycle
  with Razorpay test credentials and webhook retries.
- Complete frontend pages and production-grade accessibility, error handling,
  and responsive behavior.

Deployment providers such as Vercel, Render, Railway, Neon, Supabase, AWS or
Cloudflare are options, not assumptions encoded in the implementation.
