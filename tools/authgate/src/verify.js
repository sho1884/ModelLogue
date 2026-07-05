// Cloudflare Access JWT verification (SR-137).
//
// Pure, dependency-free RS256 verification of the per-request assertion
// Cloudflare Access attaches as `Cf-Access-Jwt-Assertion`. This is the
// authoritative server-side AI gate: it never trusts a client-asserted
// "I am authenticated" flag — only a signature it can check against the
// team's JWKS. See Doc/Security_Design.md §A01.
//
// Kept free of I/O so the whole verification is unit-testable with a locally
// generated keypair; the network (JWKS fetch + cache) lives in server.js.

import crypto from 'node:crypto';

export class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthError';
  }
}

function b64urlToBuf(seg) {
  // Buffer accepts base64url directly (Node 16+). Guard against non-strings.
  if (typeof seg !== 'string' || seg.length === 0) throw new AuthError('malformed token');
  return Buffer.from(seg, 'base64url');
}

export function parseJwt(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new AuthError('malformed token');
  const [h, p, s] = parts;
  let header;
  let payload;
  try {
    header = JSON.parse(b64urlToBuf(h).toString('utf8'));
  } catch {
    throw new AuthError('unparseable header');
  }
  try {
    payload = JSON.parse(b64urlToBuf(p).toString('utf8'));
  } catch {
    throw new AuthError('unparseable payload');
  }
  // Decode the signature leniently (an `alg:none` forgery sends it empty) so
  // the explicit RS256 check below is what rejects it.
  const signature = Buffer.from(s, 'base64url');
  return { header, payload, signingInput: `${h}.${p}`, signature };
}

/**
 * Verify a Cloudflare Access JWT. Returns `{ email }` on success; throws
 * AuthError otherwise. Pure — the caller supplies the JWKS keys and clock.
 *
 * @param {string} token  the raw compact JWT
 * @param {object} opts
 * @param {string} opts.issuer  expected `iss`, e.g. https://<team>.cloudflareaccess.com
 * @param {string} opts.aud     this application's Access AUD tag (must be in `aud`)
 * @param {Array}  opts.jwks    array of JWK objects ({kid,kty,n,e,...})
 * @param {number} [opts.now]   current time in ms (default Date.now())
 * @param {number} [opts.skewSeconds]  allowed clock skew (default 60)
 */
export function verifyAccessJwt(token, { issuer, aud, jwks, now = Date.now(), skewSeconds = 60 }) {
  if (!issuer || !aud) throw new AuthError('verifier misconfigured');
  const { header, payload, signingInput, signature } = parseJwt(token);

  // 1. Algorithm must be RS256 — reject `none`/HS* to block algorithm confusion.
  if (header.alg !== 'RS256') throw new AuthError('unexpected alg');

  // 2. Signature against the JWKS key named by `kid`.
  const jwk = Array.isArray(jwks)
    ? jwks.find((k) => k && k.kty === 'RSA' && k.kid === header.kid)
    : undefined;
  if (!jwk) throw new AuthError('unknown kid');
  let key;
  try {
    key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  } catch {
    throw new AuthError('bad key');
  }
  const sigOk = crypto.verify('RSA-SHA256', Buffer.from(signingInput), key, signature);
  if (!sigOk) throw new AuthError('bad signature');

  // 3. Claims. iss exact; aud must contain our tag; exp in the future.
  if (payload.iss !== issuer) throw new AuthError('bad iss');
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) throw new AuthError('bad aud');
  const nowSec = Math.floor(now / 1000);
  if (typeof payload.exp !== 'number' || payload.exp + skewSeconds < nowSec) {
    throw new AuthError('expired');
  }
  if (typeof payload.nbf === 'number' && payload.nbf - skewSeconds > nowSec) {
    throw new AuthError('not yet valid');
  }

  // 4. Operator identity.
  const email = payload.email;
  if (!email || typeof email !== 'string') throw new AuthError('no email claim');
  return { email };
}
