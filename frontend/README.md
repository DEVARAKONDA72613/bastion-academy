# Bastion Academy frontend

The frontend is a Next.js 14/React application using TypeScript and Tailwind.
It is an early, partial application rather than a complete implementation of
the product page inventory.

## Setup

From this directory:

```powershell
npm install
Copy-Item .env.local.example .env.local
# Set NEXT_PUBLIC_API_BASE_URL if the backend is not at its default URL.
npm run dev
```

Visit `http://localhost:3000`. The root page currently redirects to `/login`.
The backend must be running and configured with
`CLIENT_ORIGIN=http://localhost:3000` for browser API calls. The API client
sends the session cookie using `credentials: 'include'`.

## Current pages and components

- Registration, login and OTP verification pages.
- Authenticated dashboard, course list/detail, watch, pricing, security
  settings, admin, and live-room pages.
- Shared app shell, auth card, comment thread and video player components.
- `src/lib/api.ts` provides typed wrappers for a subset of the backend API.
- `src/lib/theme.ts` applies the selected theme; the root layout reads the
  stored theme before paint.

The watch page/player and live-room page are functional UI prototypes, not
production-complete experiences. The video player uses a public demo clip when
the backend marks its stream URL as mock. The live room uses browser
peer-to-peer WebRTC and the current single-process Socket.IO signaling
implementation.

## Not implemented or incomplete

- Marketing landing page (the root redirects to login).
- Live-room listing/creation page (`/live`).
- Instructor course/video editing and upload UI.
- Full production-ready responsive/accessibility, loading, empty, and error
  states across all pages.
- Real video storage/CDN delivery, scalable SFU-based group calling, and a
  recording pipeline.

There is no frontend test script or frontend-specific automated test suite
configured at this stage. `npm run build` and `npm run lint` are available.
