import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyAccessJwt, parseJwt, AuthError } from '../src/verify.js';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

// One 2048-bit RSA keypair stands in for Cloudflare's signing key.
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'kid-1', alg: 'RS256', use: 'sig' };
const jwks = [jwk];

const ISSUER = 'https://team.cloudflareaccess.com';
const AUD = 'app-aud-tag';
const NOW = 1_700_000_000_000;
const NOW_SEC = Math.floor(NOW / 1000);

function makeToken({ header = {}, payload = {}, key = privateKey, sign = true } = {}) {
  const h = b64url(JSON.stringify({ alg: 'RS256', kid: 'kid-1', typ: 'JWT', ...header }));
  const claims = { iss: ISSUER, aud: AUD, exp: NOW_SEC + 3600, email: 'op@example.com', ...payload };
  const p = b64url(JSON.stringify(claims));
  const signingInput = `${h}.${p}`;
  const sig = sign ? b64url(crypto.sign('RSA-SHA256', Buffer.from(signingInput), key)) : '';
  return `${signingInput}.${sig}`;
}

const opts = { issuer: ISSUER, aud: AUD, jwks, now: NOW };

test('valid token yields the operator email', () => {
  assert.deepEqual(verifyAccessJwt(makeToken(), opts), { email: 'op@example.com' });
});

test('array aud containing our tag is accepted', () => {
  const t = makeToken({ payload: { aud: ['other', AUD] } });
  assert.deepEqual(verifyAccessJwt(t, opts), { email: 'op@example.com' });
});

test('rejects wrong audience (token minted for another app)', () => {
  const t = makeToken({ payload: { aud: 'someone-elses-app' } });
  assert.throws(() => verifyAccessJwt(t, opts), /bad aud/);
});

test('rejects wrong issuer', () => {
  const t = makeToken({ payload: { iss: 'https://evil.cloudflareaccess.com' } });
  assert.throws(() => verifyAccessJwt(t, opts), /bad iss/);
});

test('rejects expired token', () => {
  const t = makeToken({ payload: { exp: NOW_SEC - 3600 } });
  assert.throws(() => verifyAccessJwt(t, opts), /expired/);
});

test('rejects alg=none (algorithm confusion)', () => {
  // Forge an unsigned token claiming alg none.
  const h = b64url(JSON.stringify({ alg: 'none', kid: 'kid-1', typ: 'JWT' }));
  const p = b64url(JSON.stringify({ iss: ISSUER, aud: AUD, exp: NOW_SEC + 3600, email: 'op@example.com' }));
  assert.throws(() => verifyAccessJwt(`${h}.${p}.`, opts), /unexpected alg/);
});

test('rejects a token signed by a different (attacker) key', () => {
  const attacker = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const t = makeToken({ key: attacker });
  assert.throws(() => verifyAccessJwt(t, opts), /bad signature/);
});

test('rejects a tampered payload (signature no longer matches)', () => {
  const t = makeToken();
  const [h, , s] = t.split('.');
  const forged = b64url(JSON.stringify({ iss: ISSUER, aud: AUD, exp: NOW_SEC + 3600, email: 'attacker@evil.com' }));
  assert.throws(() => verifyAccessJwt(`${h}.${forged}.${s}`, opts), /bad signature/);
});

test('rejects unknown kid', () => {
  const t = makeToken({ header: { kid: 'kid-unknown' } });
  assert.throws(() => verifyAccessJwt(t, opts), /unknown kid/);
});

test('rejects missing email claim', () => {
  const t = makeToken({ payload: { email: undefined } });
  assert.throws(() => verifyAccessJwt(t, opts), /no email/);
});

test('rejects malformed token', () => {
  assert.throws(() => verifyAccessJwt('not-a-jwt', opts), AuthError);
  assert.throws(() => parseJwt('a.b'), /malformed/);
});

test('aud is optional: verifies without an aud configured (single-app team)', () => {
  assert.deepEqual(verifyAccessJwt(makeToken(), { ...opts, aud: '' }), { email: 'op@example.com' });
});

test('but a configured aud is still enforced when wrong', () => {
  const t = makeToken({ payload: { aud: 'someone-elses-app' } });
  assert.throws(() => verifyAccessJwt(t, opts), /bad aud/);
});

test('rejects when verifier is misconfigured (no issuer)', () => {
  assert.throws(() => verifyAccessJwt(makeToken(), { ...opts, issuer: '' }), /misconfigured/);
});
