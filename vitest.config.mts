import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

import { config } from 'dotenv';

config();

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['**/tmp_old/**', '**/node_modules/**'],
    testTimeout: 10000,
    hookTimeout: 10000,
    globals: true,
    environmentOptions: {
      jsdom: {
        resources: 'usable',
      },
    },
  },
  // ignore files
});
