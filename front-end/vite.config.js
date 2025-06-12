import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': {}
  },
  server: {
    watch: {
      usePolling: true,
      interval: 100, // optional: adjust if needed
    },
    host: '0.0.0.0', // allows LAN access if needed
  }
})
