import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
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
})
