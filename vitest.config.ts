import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // `server-only` is a no-op marker from Next.js; vitest can't resolve it.
      'server-only': new URL('./lib/__server-only-shim__.ts', import.meta.url).pathname,
      '@': new URL('./', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['**/*.test.ts', '**/*.test.tsx'],
  },
});
