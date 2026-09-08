import { sentryVitePlugin } from '@sentry/vite-plugin';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';

const sentryBuildConfigured = Boolean(
  process.env.SENTRY_AUTH_TOKEN &&
  process.env.SENTRY_ORG &&
  process.env.SENTRY_PROJECT,
);

export default defineConfig({
  server: {
    watch: {
      ignored: ['**/qa/**'],
    },
  },
  build: {
    sourcemap: sentryBuildConfigured ? 'hidden' : false,
  },
  plugins: sentryBuildConfigured
    ? [
        sentryVitePlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: process.env.SENTRY_AUTH_TOKEN,
          telemetry: false,
        }),
      ]
    : [],
  test: {
    environment: 'node',
    globals: true,
    exclude: [
      ...configDefaults.exclude,
      'qa/**/recoverable/**',
      'qa/**/baseline-runtime/**',
    ],
  },
});
