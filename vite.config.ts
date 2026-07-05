import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

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
  plugins: [react(), tailwindcss()],
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
