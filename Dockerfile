# syntax=docker/dockerfile:1
#
# SR-139: single self-contained web image. Builds the SPA (no VITE_* base
# URLs baked in, so it uses same-origin relative prefixes and needs no
# per-host rebuild) and serves it via Caddy, which also reverse-proxies the
# API prefixes to the sibling containers. See deploy/Caddyfile.

# --- Build the SPA ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Serve the SPA (/app) + reverse-proxy the APIs; the site root is a mount ---
FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
# The SPA is built with base /app/, so it lives under /srv/app.
COPY --from=build /app/dist /srv/app
# The site root (/) is NOT part of this tool: it is co-located content, bind-
# mounted at /srv/sites/<name> by the server-only docker-compose.override.yml
# and deployed from its own repo. Only the Caddy route above knows about it.
# Self-destroying worker at /sw.js that retires the app's old root-scoped SW.
COPY deploy/sw.js /srv/sw.js
EXPOSE 80
