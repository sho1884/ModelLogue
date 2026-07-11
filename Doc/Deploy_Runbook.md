# ModelLogue Deploy Runbook — limited public beta

> **⚠ Read [deploy/ENVIRONMENT.md](../deploy/ENVIRONMENT.md) first.** That file
> describes the box that is *actually running*; this runbook is the *from-scratch
> setup*. Where the two differ, ENVIRONMENT.md wins. Known differences today:
> the live box is an **XServer VPS** (not Hetzner), the code is updated with
> **`./deploy/deploy.sh`** (not `git pull` — the server is not a git checkout),
> the AI provider is **OpenAI gpt-5.5** (not Gemini), and the stack is brought
> up with **three** compose files under project name `modellogue`.

Goal: the review tool is **public** (anyone can use it without AI); only **you**
(the authenticated operator) get the AI chat. No inbound ports are opened; TLS
and identity are handled by Cloudflare in front of a small box.

Architecture: `Cloudflare Tunnel → Caddy (web) → { SPA, PlantUML, nswitch, n8n }`.
The AI relay (`/n8n/webhook/*`) is gated twice — Cloudflare Access at the edge
**and** the `auth-verify` service at the origin (SR-137), which verifies the
signed Access assertion and fails closed. See [Security_Design.md](Security_Design.md) §A01.

You need three accounts: a **domain**, a **Cloudflare** account (free), and a
**Hetzner** account. Everything else is in this repo.

---

## 1. Provision the box (Hetzner)

1. Hetzner Cloud → new project → **Add Server**: Ubuntu 24.04, a small shared
   vCPU plan (CX22 is plenty for a beta), your region, add your SSH key.
2. SSH in and install Docker:
   ```bash
   ssh root@<server-ip>
   curl -fsSL https://get.docker.com | sh
   ```
3. Get the code and prepare env:
   ```bash
   git clone <your-repo-url> modellogue && cd modellogue
   cp .env.example .env      # fill in section 4
   ```

## 2. Put the domain on Cloudflare

1. Cloudflare dashboard → **Add a site** → your domain → follow the prompt to
   change your registrar's **nameservers** to Cloudflare's. Wait until active.

## 3. Cloudflare Tunnel (no open ports)

1. Cloudflare **Zero Trust** → **Networks → Tunnels** → **Create a tunnel**
   (type: *Cloudflared*). Name it, save.
2. It shows an install command with a token. Run the **Docker** variant on the
   box (or add it to the stack — see note). This connects out to Cloudflare; no
   inbound firewall rule is needed.
3. **Public hostname**: `modellogue.example.com` → service
   `http://localhost:8088` (Caddy's `WEB_PORT`). Save.

> The site is now reachable at `https://modellogue.example.com` with TLS
> terminated by Cloudflare.

## 4. Cloudflare Access (identity for the AI only)

The app must stay public, so scope Access to **only the AI paths** — not the
whole site.

1. Zero Trust → **Access → Applications → Add an application** → *Self-hosted*.
2. Application domain — add these paths (Add domain for each):
   - `modellogue.example.com/n8n/webhook/*`  ← the AI relay (the real gate)
   - `modellogue.example.com/auth/login`     ← the "Sign in" entry point
   - `modellogue.example.com/auth/whoami`    ← the SPA's identity probe
3. **Policy**: action *Allow*, rule *Emails* = your operator email(s).
4. Save. Then on the application's **Overview**, copy the **Application Audience
   (AUD) Tag**.
5. Your **team name** is in Zero Trust → **Settings → Custom Pages / team
   domain**: `<team>.cloudflareaccess.com` → the `<team>` part.

> Everything NOT listed above (the app at `/`, PlantUML, nswitch) stays public.
> An anonymous browser that hits `/n8n/webhook/*` is challenged by Access and,
> even if that were misconfigured, rejected by `auth-verify`.

## 5. Fill `.env` and bring up the stack

```ini
WEB_PORT=8088
PUBLIC_BASE_URL=https://modellogue.example.com
CF_TEAM_DOMAIN=<team>            # from step 4.5
CF_ACCESS_AUD=<aud-tag>          # from step 4.4
# AUTHGATE_ALLOW_INSECURE stays unset/0 in production (fail-closed)
```

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

> **On the live box** the stack is brought up with three files and a
> server-only override (see ENVIRONMENT.md):
> `docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.override.yml up -d`.
> After the first setup, you never type this by hand — routine updates are just
> `./deploy/deploy.sh` from the repo.

Confirm the gate is enforcing (not insecure/deny):
```bash
docker compose -f docker-compose.prod.yml exec auth-verify \
  node -e 'fetch("http://127.0.0.1:8092/health").then(r=>r.json()).then(console.log)'
# → { status: 'ok', mode: 'enforce', issuer: 'https://<team>.cloudflareaccess.com' }
```

## 6. Configure n8n (the AI relay + the AI provider key)

> **On the live box the AI provider is OpenAI (`gpt-5.5`), not Gemini.** The
> steps below are identical either way — add whichever provider's credential in
> n8n and point the workflow at it. The key lives only in n8n, never in the repo.

The n8n editor is **not** web-exposed. Reach it over SSH:
```bash
ssh -L 5678:localhost:5678 root@<server-ip>
docker compose -f docker-compose.prod.yml exec -d n8n sh -c \
  'N8N_SECURE_COOKIE=false n8n' # only if needed; usually just tunnel to 5678
```
Then in the n8n UI (via the SSH tunnel):
1. Import `n8n/workflows/*.json`.
2. Add the **Gemini** credential (API key lives here, never in the repo).
3. **Activate** the chat workflow.

## 7. Verify (the important part)

- **Public**, incognito: open `https://modellogue.example.com` — the review
  tool works; **no chat pane**.
- **Operator**: click **Sign in** → Cloudflare Access login → back to the app →
  the **chat pane appears** and AI works.
- **Security check** — an unauthenticated AI call must never reach Gemini:
  ```bash
  curl -si -X POST https://modellogue.example.com/n8n/webhook/modellogue-chat \
    -H 'Content-Type: application/json' -d '{}'
  # → blocked by Access (302 to login) / 403 from auth-verify. NOT a 200.
  ```

## Notes

- **Swapping the gate provider** (NFR-091): `auth-verify` verifies a signed
  assertion and Caddy maps the identity header in one place. Replacing
  Cloudflare Access with a self-hosted OIDC forward-auth changes only
  `auth-verify`'s config, not the SPA or the seam.
- **Running the prod stack locally** (no gate): set `AUTHGATE_ALLOW_INSECURE=1`
  in `.env`. Never do this on the server.
- **`/auth/whoami` probe**: it is Access-protected, so an anonymous request is
  redirected to login; the SPA treats a non-200 as "anonymous". Validate this
  round-trip once against your real Access app (it can't be tested without it).
- **cloudflared as a stack service** (optional): instead of installing on the
  host, add a `cloudflared` service running `cloudflared tunnel run` with the
  tunnel token in `.env`, pointing the hostname at `http://web:80`.
