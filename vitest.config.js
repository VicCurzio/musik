import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('test'),
  },
  test: {
    // The engine touches Audio, document and navigator, so it needs a DOM.
    environment: 'jsdom',
    include: ['test/**/*.test.js'],
  },
});
