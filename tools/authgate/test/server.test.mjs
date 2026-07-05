import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { createHandler, configFromEnv } from '../src/server.js';

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'kid-1', alg: 'RS256', use: 'sig' };
const ISSUER = 'https://team.cloudflareaccess.com';
const AUD = 'app-aud';
const NOW = 1_700_000_000_000;

function token(overrides = {}) {
  const h = b64url(JSON.stringify({ alg: 'RS256', kid: 'kid-1', typ: 'JWT' }));
  const p = b64url(
    JSON.stringify({ iss: ISSUER, aud: AUD, exp: Math.floor(NOW / 1000) + 3600, email: 'op@example.com', ...overrides })
  );
  const sig = b64url(crypto.sign('RSA-SHA256', Buffer.from(`${h}.${p}`), privateKey));
  return `${h}.${p}.${sig}`;
}

async function call(handler, { headers = {}, path = '/verify' } = {}) {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
    return { status: res.status, email: res.headers.get('cf-access-authenticated-user-email'), body: await res.json() };
  } finally {
    server.close();
  }
}

const enforceCfg = {
  mode: 'enforce',
  issuer: ISSUER,
  aud: AUD,
  now: () => NOW,
  jwksProvider: async () => [jwk], // inject keys — no network
};

test('enforce: valid assertion → 200 with operator email header', async () => {
  const r = await call(createHandler(enforceCfg), { headers: { 'cf-access-jwt-assertion': token() } });
  assert.equal(r.status, 200);
  assert.equal(r.email, 'op@example.com');
});

test('enforce: missing assertion → 401', async () => {
  const r = await call(createHandler(enforceCfg));
  assert.equal(r.status, 401);
});

test('enforce: wrong audience → 403', async () => {
  const r = await call(createHandler(enforceCfg), { headers: { 'cf-access-jwt-assertion': token({ aud: 'other' }) } });
  assert.equal(r.status, 403);
});

test('enforce: expired → 403', async () => {
  const r = await call(createHandler(enforceCfg), {
    headers: { 'cf-access-jwt-assertion': token({ exp: Math.floor(NOW / 1000) - 3600 }) },
  });
  assert.equal(r.status, 403);
});

test('deny mode (unconfigured) blocks everything, fail-closed', async () => {
  const r = await call(createHandler({ mode: 'deny' }), { headers: { 'cf-access-jwt-assertion': token() } });
  assert.equal(r.status, 403);
});

test('insecure mode allows (dev opt-in)', async () => {
  const r = await call(createHandler({ mode: 'insecure' }));
  assert.equal(r.status, 200);
  assert.equal(r.email, 'insecure-dev@localhost');
});

test('health reports the mode', async () => {
  const r = await call(createHandler({ mode: 'deny' }), { path: '/health' });
  assert.equal(r.status, 200);
  assert.equal(r.body.mode, 'deny');
});

test('configFromEnv: fail-closed by default, insecure opt-in, enforce when set', () => {
  assert.equal(configFromEnv({}).mode, 'deny');
  assert.equal(configFromEnv({ AUTHGATE_ALLOW_INSECURE: '1' }).mode, 'insecure');
  const enf = configFromEnv({ CF_TEAM_DOMAIN: 'myteam', CF_ACCESS_AUD: 'aud' });
  assert.equal(enf.mode, 'enforce');
  assert.equal(enf.issuer, 'https://myteam.cloudflareaccess.com');
});
