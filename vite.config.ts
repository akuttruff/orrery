import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import api from './server/api.ts'

// Any name on the tailnet, not one machine's: `tailscale serve` is what
// actually limits who can reach this, so a rename shouldn't break it.
const TAILNET = '.ts.net'
// Loopback only: `tailscale serve` proxies to 127.0.0.1, and the API has no
// login, so listening on every interface would open it to the whole Wi-Fi.
const HOST = '127.0.0.1'

export default defineConfig(({ command, isPreview }) => {
  // `vite preview` is the one real instance (local and, via Tailscale,
  // remote). `vite dev` runs against a separate scratch database, so trying
  // something out while developing never touches the real readings.
  const usingRealData = command === 'build' || isPreview
  const dir = usingRealData ? undefined : path.resolve(process.cwd(), '.data-dev')

  return {
    plugins: [react(), api({ dir })],
    server: {
      host: HOST,
      port: 8400,
      strictPort: true,
      allowedHosts: [TAILNET],
      watch: { ignored: ['**/coverage/**', '**/.data/**', '**/.data-dev/**'] },
    },
    // A separate port from `server` above: the persistent, built instance
    // Tailscale points at, so it can run alongside `npm run dev`.
    preview: { host: HOST, port: 8410, strictPort: true, allowedHosts: [TAILNET] },
  }
})
