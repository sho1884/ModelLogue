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

# --- Serve the SPA + reverse-proxy the API prefixes ---
FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 80
