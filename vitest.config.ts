import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 30000, // crawl tests can be slow
    hookTimeout: 10000,
  },
});
