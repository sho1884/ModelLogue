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

# --- Serve the static landing (/) + the SPA (/app) + reverse-proxy the APIs ---
FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
# The SPA is built with base /app/, so it lives under /srv/app.
COPY --from=build /app/dist /srv/app
# Simple static landing page at the site root (real content added later).
COPY deploy/landing/index.html /srv/index.html
EXPOSE 80
