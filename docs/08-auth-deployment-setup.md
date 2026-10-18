# Bastion Academy authentication provider setup

The code defaults to `EMAIL_PROVIDER=mock` for safe local development. Real Gmail delivery stays disabled until the Render secrets below are configured.

## Gmail OTP delivery (login, registration and password reset)

1. Use a Gmail account that will send Bastion Academy emails.
2. Turn on Google 2-Step Verification for that account.
3. Create a Google App Password from Google Account → Security → App passwords. Do not use the account's normal password.
4. In the Render service environment, set:
   - `EMAIL_PROVIDER=gmail`
   - `GMAIL_USER` = the sender Gmail address
   - `GMAIL_APP_PASSWORD` = the app password, stored as a secret
   - `EMAIL_FROM` = optional; normally leave unset so the sender address is `GMAIL_USER`
5. Save/redeploy Render. Trigger registration or Forgot password and check the recipient's inbox and spam folder. OTPs should be delivered by email; the Gmail adapter does not log the code.

Never commit the app password, put it in `render.yaml`, or paste it into chat. The 16-character App Password is entered only in Render's environment settings.

## Google sign-in

1. Open Google Cloud Console and create/select a project.
2. Configure the OAuth consent screen as appropriate for the project.
3. Create an OAuth Client ID of type **Web application**.
4. Add `https://bastion-academy.vercel.app` to **Authorized JavaScript origins**. Add `http://localhost:3000` only if you need local development.
5. Copy the Web Client ID (it ends with `.apps.googleusercontent.com`).
6. Set the exact same Client ID in:
   - Vercel: `NEXT_PUBLIC_GOOGLE_CLIENT_ID` for Production and Preview.
   - Render: `GOOGLE_CLIENT_ID`.
7. Redeploy Vercel and Render. No Google Client Secret is used by this Google Identity Services credential flow.

The backend validates the Google ID token signature against Google's published rotating public keys and checks issuer, audience, expiry and verified email. First-time Google users receive a normal Free account. A new/untrusted browser still has to complete the existing email OTP challenge.

## Password reset

`/forgot-password` sends a reset OTP through the active email provider. `/reset-password` verifies the code, hashes the new password with Argon2, and revokes existing sessions. User existence is not disclosed by the request-code response.

## Required smoke tests after configuring providers

- Register a test account and confirm its email OTP arrives.
- Sign in on a new browser/device and confirm the login OTP arrives.
- Use Forgot password, enter the emailed code, change the password, and sign in with the new password.
- Use the Google button once for a new Gmail account and once for an existing account.
- Confirm that an incorrect/expired OTP is rejected and an unknown email does not reveal account existence.