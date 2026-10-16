# Bastion Academy — Local verification and final submission runbook

**Prepared:** 16 October 2026
**Project root on the developer machine:** `D:\bastion-academy`

This document records the current continuation patch and gives the commands needed for a dependency-backed verification. A source-level TypeScript/TSX parse check passed for all 61 files in the editing environment. A full build and automated test run could not be completed there because npm dependencies were not present and the npm registry could not be resolved. Do not represent the patch as fully tested until the commands below pass locally.

## 1. Apply the source update safely

1. Keep a backup/commit of the current `D:\bastion-academy` folder first.
2. Extract the provided updated source ZIP into the existing `D:\bastion-academy` project directory, allowing the changed source files to overwrite their matching paths.
3. Do **not** replace local `backend\.env` or `frontend\.env.local` with example files. Those real environment files are intentionally excluded from the archive. The archive contains only `.env.example` / `.env.local.example` templates.
4. Confirm this is the same base project used during training. The internship brief says a different/new project can be rejected; source continuity must be true and defensible before submission.

## 2. Install dependencies and validate

Run from PowerShell, not from the project root:

```powershell
Set-Location D:\bastion-academy\backend
npm ci
npm run build
npm test
```

If you are using a separate disposable PostgreSQL test database with migrations and seed data already applied, also run:

```powershell
npm run test:quota-race
```

**Do not run the race test against production data.** It deletes/reset the test user's current-day quota/download rows as part of setup and cleanup.

In another PowerShell terminal:

```powershell
Set-Location D:\bastion-academy\frontend
npm ci
npm run build
```

Resolve every reported error before deploying. Save the full logs if a command fails so the exact compiler/runtime error can be diagnosed.

## 3. Local environment checklist

- `backend\.env` must contain a real development/test `DATABASE_URL`, separate long random `SESSION_SECRET` and `JWT_SECRET` values, `CLIENT_ORIGIN=http://localhost:3000`, Razorpay **test-mode** values if testing checkout, and `EMAIL_PROVIDER=mock` for console OTP/email output.
- `frontend\.env.local` must point to `http://localhost:4000/api/v1` and `http://localhost:4000` during local development.
- Restart the backend after changing its `.env`; it reads these variables on startup.
- Run `npm run dev` in each package's own directory. If port 4000 is busy, stop the old backend process/terminal first.

## 4. Two-client live-room test

Use two separate browser profiles or one normal and one private window, signed in as two different accounts. Use a Gold/instructor account as host and an eligible paid account as participant.

Verify: create/join, remote audio/video, mic/camera controls, raised-hand state, name tiles, chat and emoji, peer-to-peer file share (5 MB limit), screen share, mobile camera selection where available, connection indicators, People tab, host mute/remove/co-host, per-user chat/screen-share permissions, lock and new-join rejection, refresh/reconnect, leaving, and end-for-all. Test denied camera/mic permissions. Recording must still be described as **recording intent only**—the code does not capture or persist audio/video.

## 5. Deployment checklist (not yet performed by this patch)

The frontend and API need to be deployed separately or behind one site/reverse proxy. The frontend deployment alone is not enough; the backend must reach Neon PostgreSQL and Socket.IO signalling must work over HTTPS/WSS.

- Deploy the frontend on Vercel or Netlify and the Express backend on a Node host that supports persistent HTTP/Socket.IO connections.
- Apply the schema migration against the intended database only after reviewing it and taking a backup.
- Configure production API base URL, Socket URL, `CLIENT_ORIGIN`, database URL, secure secrets, Razorpay test keys and webhook secret in hosting environment settings—never in source control.
- If frontend and API are on different registrable domains, set `SESSION_COOKIE_SAME_SITE=none` and `NODE_ENV=production` for the API so the cross-site session cookie is `Secure`, `httpOnly`, and `SameSite=None`. Configure CORS to the exact frontend origin, not `*`. A same-site custom-domain/reverse-proxy deployment is preferable when available.
- Configure the public Razorpay webhook URL in the test dashboard and verify a captured payment before claiming billing works end-to-end.
- Test registration/OTP, login, API calls, socket connection, download quotas, webhook delivery, invoice view, and mobile layouts against the **public** frontend/backend URLs. Public access must not rely on a developer login or local host.

## 6. Features that remain mock, constrained, or unverified

- OTP and subscription email use a console/mock adapter. Translation is mock-backed. IP city/state/country stay null without a geolocation provider.
- There is no real object storage/CDN media pipeline. Player uses a clearly labelled public demo MP4 when the stream response is mocked. Download records/quota are implemented, but this does not mean a real offline file was delivered.
- Meetings use peer-to-peer WebRTC mesh and process-local Socket.IO signalling. There is no SFU, no app-level end-to-end encryption guarantee, and no actual recording capture/storage. Peer-to-peer file shares are temporary browser data-channel transfers, capped at 5 MB, not hosted files.
- Razorpay webhook activation verifies signature and order amount/currency, but recurring subscription charging is not configured; checkout is a one-time test payment. Email sending beyond the mock is not implemented.
- Notification delivery, sign-in with Google, production-grade reliability/reconnection testing, browser/mobile accessibility testing, and broad integration/security tests remain incomplete.

## 7. Before one-time internship submission

- Confirm the updated work is an extension of your **actual training project**.
- Run all builds/tests and fix errors.
- Deploy and open the public link in a logged-out/private browser session.
- Test core journeys at phone and tablet widths, including live room only in browsers that support camera/microphone permissions on HTTPS.
- Record a 2–5 minute demo of the running app (MP4, WebM or MOV; under 100 MB). Review audio/readability once before upload.
- Submit only after checking every link and file, because the brief says the submission is one-time and cannot be replaced.
