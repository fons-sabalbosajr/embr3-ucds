import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['./tests/setup.js'],
    // The integration suite talks to MongoDB Atlas; keep files serial so
    // throwaway accounts from one file cannot collide with another.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
