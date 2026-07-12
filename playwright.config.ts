import { defineConfig, devices } from '@playwright/test'

/**
 * E2E smoke against the Vite dev server.
 * Start with: npm run test:e2e  (webServer starts vite automatically)
 */
export default defineConfig({
  testDir: './e2e',
  // Auth-emulator suite lives under e2e/emulator and uses playwright.emulator.config.ts
  // (VITE_USE_FIREBASE_EMULATORS). Never pick those up in smoke — CI was failing on
  // missing emulator-banner when smoke ran without emulators.
  testIgnore: ['**/emulator/**'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
