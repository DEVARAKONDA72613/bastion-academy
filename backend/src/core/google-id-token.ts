import { createPublicKey, verify as verifySignature } from 'node:crypto';
import { AppError } from './errors.js';

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
type GoogleJwk = { kid: string; kty: string; alg?: string; use?: string; n: string; e: string; [key: string]: unknown };
type GoogleClaims = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  hd?: string;
  name?: string;
  picture?: string;
};

let cachedKeys: GoogleJwk[] = [];
let keysExpireAt = 0;

async function getGoogleKeys(forceRefresh = false): Promise<GoogleJwk[]> {
  if (!forceRefresh && cachedKeys.length > 0 && Date.now() < keysExpireAt) return cachedKeys;

  let response: Response;
  try {
    response = await fetch(GOOGLE_CERTS_URL, { signal: AbortSignal.timeout(8000) });
  } catch {
    if (cachedKeys.length > 0 && Date.now() < keysExpireAt + 6 * 60 * 60 * 1000) return cachedKeys;
    throw new AppError(503, 'google_auth_unavailable', 'Google sign-in is temporarily unavailable. Please try again.');
  }
  if (!response.ok) {
    throw new AppError(503, 'google_auth_unavailable', 'Google sign-in is temporarily unavailable. Please try again.');
  }

  const body = await response.json() as { keys?: GoogleJwk[] };
  if (!Array.isArray(body.keys) || body.keys.length === 0) {
    throw new AppError(503, 'google_auth_unavailable', 'Google sign-in could not be verified right now.');
  }

  cachedKeys = body.keys;
  const cacheControl = response.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSeconds = Math.max(60, Math.min(Number(maxAgeMatch?.[1] || 3600), 86400));
  keysExpireAt = Date.now() + maxAgeSeconds * 1000;
  return cachedKeys;
}

/**
 * Validate a Google Identity Services ID token locally against Google's rotating
 * JWK public keys. Checks the signature, audience, issuer, expiry and verified email.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<{
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    throw new AppError(503, 'google_not_configured', 'Google sign-in is not configured yet.');
  }

  const parts = idToken.split('.');
  if (parts.length !== 3 || idToken.length > 10000) {
    throw new AppError(401, 'invalid_google_credential', 'Google sign-in failed. Please try again.');
  }

  let header: { alg?: string; kid?: string };
  let claims: GoogleClaims;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new AppError(401, 'invalid_google_credential', 'Google sign-in failed. Please try again.');
  }

  if (header.alg !== 'RS256' || !header.kid) {
    throw new AppError(401, 'invalid_google_credential', 'Google sign-in failed. Please try again.');
  }

  let keys = await getGoogleKeys();
  let jwk = keys.find((key) => key.kid === header.kid && (!key.use || key.use === 'sig'));
  if (!jwk) {
    keys = await getGoogleKeys(true);
    jwk = keys.find((key) => key.kid === header.kid && (!key.use || key.use === 'sig'));
  }
  if (!jwk) {
    throw new AppError(401, 'invalid_google_credential', 'Google sign-in failed. Please try again.');
  }

  let signatureValid = false;
  try {
    const publicKey = createPublicKey({ key: jwk as any, format: 'jwk' });
    signatureValid = verifySignature(
      'RSA-SHA256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      publicKey,
      Buffer.from(parts[2], 'base64url')
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) {
    throw new AppError(401, 'invalid_google_credential', 'Google sign-in failed. Please try again.');
  }

  const now = Math.floor(Date.now() / 1000);
  const audienceOk = typeof claims.aud === 'string'
    ? claims.aud === clientId
    : Array.isArray(claims.aud) && claims.aud.includes(clientId);
  const issuerOk = claims.iss === 'accounts.google.com' || claims.iss === 'https://accounts.google.com';
  if (!audienceOk || !issuerOk || typeof claims.exp !== 'number' || claims.exp <= now || (typeof claims.iat === 'number' && claims.iat > now + 60)) {
    throw new AppError(401, 'invalid_google_credential', 'Google sign-in failed. Please try again.');
  }

  if (!claims.sub || !claims.email || claims.email_verified !== true) {
    throw new AppError(401, 'google_email_unverified', 'Use a Google account with a verified email address.');
  }
  const emailLower = claims.email.trim().toLowerCase();
  if (!emailLower.endsWith('@gmail.com') && !claims.hd) {
    throw new AppError(401, 'google_email_unverified', 'Use a Gmail or managed Google Workspace account.');
  }

  return {
    sub: claims.sub,
    email: emailLower,
    name: claims.name,
    picture: claims.picture,
  };
}