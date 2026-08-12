import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Saf mantık testleri; tarayıcı ortamı gerekmiyor.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
