import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Built for embr3-onlinesystems.cloud/e-universe: every asset, the service
// worker and the manifest live under /e-universe/, so nothing it serves
// collides with the other systems on that domain (HRPMS owns /assets, /api...).
// `vite preview` (the office server's "UCDS Web" service) serves that build,
// so it uses the same base. The dev server stays at the root. VITE_BASE
// overrides all three.
export default defineConfig(({ command, isPreview }) => ({
  base: process.env.VITE_BASE || (command === 'build' || isPreview ? '/e-universe/' : '/'),
  plugins: [react()],
  define: {
    'process.env': {}
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@api': path.resolve(__dirname, './src/api'),
      '@utils': path.resolve(__dirname, './data/utils'),
    }
  },
  server: {
    watch: {
      usePolling: true,
      interval: 100, // optional: adjust if needed
    },
    host: '0.0.0.0', // allows LAN access if needed
  }
}))
