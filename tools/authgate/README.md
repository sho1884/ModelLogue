# modellogue-authgate

Zero-dependency Cloudflare Access JWT verifier — the **server-side AI gate**
(SR-137). Caddy `forward_auth`s every `/n8n/webhook/*` request to this service;
n8n is reached only when it answers `2xx`, so an unauthenticated request never
reaches a Gemini call — independently of the edge routing and even if the SPA
gate (SR-136) is bypassed.

Uses only the Node standard library (`http`, `crypto`) — no npm dependencies.

## Endpoints

- `GET|POST /verify` — reads the `Cf-Access-Jwt-Assertion` request header,
  verifies it, and answers `200` (with a `Cf-Access-Authenticated-User-Email`
  response header) or a non-2xx. This is the `forward_auth` target.
- `GET /health` — `{ "status": "ok", "mode": "...", "issuer": ... }`.

## Verification (RS256, standard Cloudflare Access recipe)

1. `alg` must be `RS256` (rejects `none`/HS\* — algorithm-confusion defence).
2. Signature checked against the team JWKS
   (`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`), keyed by `kid`;
   cached, refetched on unknown `kid` (rotation), rate-limited.
3. `iss` === the team domain; `aud` must contain this application's AUD tag;
   `exp` in the future (60 s skew).
4. `email` claim is returned as the operator identity.

## Modes (fail-closed)

| Env | Mode | Behaviour |
|---|---|---|
| `CF_TEAM_DOMAIN` + `CF_ACCESS_AUD` set | `enforce` | verify every assertion |
| neither set, `AUTHGATE_ALLOW_INSECURE=1` | `insecure` | allow all — **local/dev only**, logged loudly |
| neither set | `deny` | **block all AI calls** (safe default) |

## Config

| Env | Default | Meaning |
|---|---|---|
| `CF_TEAM_DOMAIN` | — | Cloudflare Access team name (the `<team>` in `<team>.cloudflareaccess.com`) |
| `CF_ACCESS_AUD` | — | the AI application's Access **AUD** tag |
| `AUTHGATE_ALLOW_INSECURE` | `0` | `1` opens the gate locally (never in production) |
| `AUTHGATE_PORT` | `8092` | listen port |
| `AUTHGATE_HOST` | `0.0.0.0` | bind address |
| `AUTHGATE_JWKS_REFRESH_MS` | `3600000` | JWKS cache TTL |

## Test

```bash
node --test        # 20 tests: RS256 verify + server modes, no network
```

The crypto (`src/verify.js`) is unit-tested against a locally generated RSA
keypair (valid, wrong-aud, wrong-iss, expired, `alg:none`, attacker-key,
tampered, unknown-kid, missing-email); the server (`src/server.js`) is tested
in all three modes with an injected JWKS provider.
