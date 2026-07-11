import { defineConfig, devices } from '@playwright/test'

/**
 * E2E against Vite + Firebase emulators (Auth, Firestore, Storage).
 * Prefer: npm run test:e2e:emulators
 * (firebase emulators:exec starts emulators, then this config).
 */
export default defineConfig({
  testDir: './e2e/emulator',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-emulator',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command:
      'npx cross-env VITE_USE_FIREBASE_EMULATORS=true VITE_FIREBASE_PROJECT_ID=demo-cheatsheet VITE_FIREBASE_EMULATORS_ALL=false npm run dev -- --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_USE_FIREBASE_EMULATORS: 'true',
      VITE_FIREBASE_PROJECT_ID: 'demo-cheatsheet',
      // Auth-only by default (no Java). Set true with full emulators script.
      VITE_FIREBASE_EMULATORS_ALL: process.env.VITE_FIREBASE_EMULATORS_ALL || 'false',
    },
  },
})
