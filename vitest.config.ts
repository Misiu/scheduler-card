import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

const litAliases = {
  'lit/decorators': 'lit/decorators.js',
  'lit/directives/style-map': 'lit/directives/style-map.js',
  'lit/directives/unsafe-html': 'lit/directives/unsafe-html.js',
};

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: {
          alias: litAliases,
        },
        test: {
          name: 'browser',
          include: ['test/browser/**/*.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
