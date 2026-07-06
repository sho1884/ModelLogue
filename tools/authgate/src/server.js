// HTTP front for the Cloudflare Access verifier (SR-137).
//
// Caddy `forward_auth`s every /n8n/webhook/* request to /verify here; a 2xx
// lets Caddy proxy on to n8n, anything else blocks the AI call. The JWKS fetch
// + cache live here; the crypto is in verify.js (unit-tested).
//
// Fail-closed: with no Cloudflare env configured the gate DENIES, unless a
// local run explicitly opts out with AUTHGATE_ALLOW_INSECURE=1.
//
// Config and the JWKS provider are injected (see createHandler), so the whole
// service — including the enforce path — is testable without network or env.

import http from 'node:http';
import { verifyAccessJwt, parseJwt, AuthError } from './verify.js';

const MIN_REFETCH_MS = 10_000; // rate-limit JWKS refetches on unknown kid

/** Build a JWKS provider that fetches + caches from Cloudflare's certs URL. */
export function cloudflareJwksProvider(jwksUrl, { refreshMs = 60 * 60 * 1000, fetchImpl = fetch } = {}) {
  let cache = { keys: [], fetchedAt: 0 };
  async function fetchJwks() {
    const res = await fetchImpl(jwksUrl);
    if (!res.ok) throw new Error(`JWKS fetch failed: HTTP ${res.status}`);
    const body = await res.json();
    cache = { keys: Array.isArray(body.keys) ? body.keys : [], fetchedAt: Date.now() };
    return cache.keys;
  }
  return async function keysFor(kid, { force = false } = {}) {
    const age = Date.now() - cache.fetchedAt;
    const known = cache.keys.some((k) => k.kid === kid);
    if (force) {
      if (age > MIN_REFETCH_MS || !cache.keys.length) return fetchJwks();
      return cache.keys;
    }
    if (cache.keys.length && known && age < refreshMs) return cache.keys;
    if (!cache.keys.length || age > MIN_REFETCH_MS) return fetchJwks();
    return cache.keys;
  };
}

/**
 * Resolve config from environment.
 * @returns {{mode:string, issuer:string, aud:string, jwksProvider?:Function}}
 */
export function configFromEnv(env = process.env) {
  const team = env.CF_TEAM_DOMAIN || '';
  const aud = env.CF_ACCESS_AUD || '';
  const allowInsecure = env.AUTHGATE_ALLOW_INSECURE === '1';
  const issuer = team ? `https://${team}.cloudflareaccess.com` : '';
  // Enforce as soon as a team domain is set. CF_ACCESS_AUD is optional and,
  // when present, additionally pins the token to a specific Access app.
  const mode = team ? 'enforce' : allowInsecure ? 'insecure' : 'deny';
  const jwksProvider =
    mode === 'enforce'
      ? cloudflareJwksProvider(`${issuer}/cdn-cgi/access/certs`, {
          refreshMs: Number(env.AUTHGATE_JWKS_REFRESH_MS || 60 * 60 * 1000),
        })
      : undefined;
  return { mode, issuer, aud, jwksProvider };
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** Create the request handler for a given config. `now` is injectable for tests. */
export function createHandler({ mode, issuer, aud, jwksProvider, now = () => Date.now() }) {
  async function handleVerify(req, res) {
    // We only inspect headers; drain any forwarded body so the socket doesn't stall.
    req.resume();
    if (mode === 'deny') return send(res, 403, { ok: false, reason: 'gate not configured (fail-closed)' });
    if (mode === 'insecure') {
      res.setHeader('Cf-Access-Authenticated-User-Email', 'insecure-dev@localhost');
      return send(res, 200, { ok: true, mode: 'insecure' });
    }
    const token = req.headers['cf-access-jwt-assertion'];
    if (!token || Array.isArray(token)) return send(res, 401, { ok: false, reason: 'no assertion' });

    let kid;
    try {
      kid = parseJwt(token).header.kid;
    } catch {
      return send(res, 401, { ok: false, reason: 'malformed assertion' });
    }
    try {
      let keys = await jwksProvider(kid);
      let result;
      try {
        result = verifyAccessJwt(token, { issuer, aud, jwks: keys, now: now() });
      } catch (e) {
        // A freshly-rotated kid may be missing from a warm cache; refetch once.
        if (e instanceof AuthError && e.message === 'unknown kid') {
          keys = await jwksProvider(kid, { force: true });
          result = verifyAccessJwt(token, { issuer, aud, jwks: keys, now: now() });
        } else {
          throw e;
        }
      }
      res.setHeader('Cf-Access-Authenticated-User-Email', result.email);
      return send(res, 200, { ok: true });
    } catch (e) {
      if (e instanceof AuthError) return send(res, 403, { ok: false, reason: e.message });
      return send(res, 502, { ok: false, reason: 'verification unavailable' });
    }
  }

  return function handler(req, res) {
    const url = (req.url || '').split('?')[0];
    if (url === '/health') return send(res, 200, { status: 'ok', mode, issuer: issuer || null });
    if (url === '/verify') return void handleVerify(req, res);
    return send(res, 404, { ok: false, reason: 'not found' });
  };
}

export function start() {
  const cfg = configFromEnv();
  const host = process.env.AUTHGATE_HOST || '0.0.0.0';
  const port = Number(process.env.AUTHGATE_PORT || 8092);
  if (cfg.mode === 'insecure') {
    console.warn('[authgate] WARNING: AUTHGATE_ALLOW_INSECURE=1 — AI gate is OPEN. Local/dev only.');
  } else if (cfg.mode === 'deny') {
    console.error('[authgate] CF_TEAM_DOMAIN/CF_ACCESS_AUD not set — gate DENIES all AI calls (fail-closed).');
  } else {
    console.log(`[authgate] enforcing Cloudflare Access for ${cfg.issuer} (aud ${cfg.aud.slice(0, 8)}…)`);
  }
  http.createServer(createHandler(cfg)).listen(port, host, () => {
    console.log(`[authgate] listening on ${host}:${port} (mode=${cfg.mode})`);
  });
}
