import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Bileşen testleri DOM istiyor; saf mantık testleri de burada koşuyor.
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
  },
});
