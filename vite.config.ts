import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// SR-143 / NFR-092: server-backed prefixes are NEVER cached or SPA-fallbacked
// by the service worker — they must always hit the network so the identity
// gate (SR-137) stays correct and diagrams / AI responses stay fresh.
const NETWORK_ONLY_PREFIXES = ['/n8n', '/auth', '/plantuml', '/nswitch']
const networkOnlyDenylist = NETWORK_ONLY_PREFIXES.map(
  (p) => new RegExp(`^${p}(/|$)`)
)

// SR-139: the SPA calls its backend services under same-origin relative
// prefixes (/plantuml, /n8n, /nswitch) so the built bundle carries no
// absolute URLs and needs no per-host rebuild. In production a reverse
// proxy (Caddy) maps these prefixes to the containers; in dev/preview the
// Vite proxy below maps them to the local Docker Compose services.
const backendProxy = {
  '/plantuml': {
    target: 'http://localhost:8080',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/plantuml/, '') || '/',
  },
  '/n8n': {
    target: 'http://localhost:5678',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/n8n/, '') || '/',
  },
  '/nswitch': {
    target: 'http://localhost:8090',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/nswitch/, '') || '/',
  },
}

// https://vite.dev/config/
export default defineConfig({
  // The SPA is served under /app; a static landing page lives at the site root
  // (see deploy/Caddyfile + deploy/landing). base makes all built asset URLs,
  // the manifest, and the service worker resolve under /app/.
  base: '/app/',
  plugins: [
    react(),
    tailwindcss(),
    // SR-143: installable PWA. registerType 'autoUpdate' + injected registration
    // means a new deploy replaces the cached shell with no manual cache clear
    // (NFR-092). The service worker precaches only the static build output; the
    // network-only prefixes above are never cached or SPA-fallbacked.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'favicon-32.png', 'favicon-16.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'ModelLogue',
        short_name: 'ModelLogue',
        description: 'モデルレビューを支援するツール（状態遷移図・要求図・プロセス図）',
        lang: 'ja',
        theme_color: '#22ce86',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/app/',
        scope: '/app/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Navigations to server-backed prefixes must reach the network, not the
        // SPA index fallback — critical for /auth/login and /n8n/webhook.
        navigateFallbackDenylist: networkOnlyDenylist,
        runtimeCaching: [
          {
            // Self-contained RegExp (no closure) so it serializes into the SW.
            // Matches same-origin /n8n, /auth, /plantuml, /nswitch (and subpaths).
            urlPattern: /\/(n8n|auth|plantuml|nswitch)(\/|$)/,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: { proxy: backendProxy },
  preview: { proxy: backendProxy },
  // Build-time JST timestamp shown next to the title so users / bug-reporters
  // can identify exactly which build is running (sibling-project convention).
  // Format: "YYYY-MM-DDTHH:mm:ss"; the header slices to "YYYY-MM-DD HH:mm".
  define: {
    __BUILD_TIME__: JSON.stringify(
      new Date()
        .toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' })
        .replace(' ', 'T')
    ),
  },
})
