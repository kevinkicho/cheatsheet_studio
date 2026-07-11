import { test, expect } from '@playwright/test'

/**
 * Workspace UI requires Firebase auth. Without a real session we only
 * assert the gate — full grid E2E needs a test account / emulators later.
 */
test.describe('Workspace access control', () => {
  test('loading or redirect from /app when signed out', async ({ page }) => {
    await page.goto('/app')
    // Either brief Loading… then landing, or immediate landing
    await expect(
      page.getByText(/CheatSheet Studio|Loading/i).first(),
    ).toBeVisible({ timeout: 15_000 })
    await expect(page).toHaveURL(/\/$/, { timeout: 20_000 })
  })
})
