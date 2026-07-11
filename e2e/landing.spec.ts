import { test, expect } from '@playwright/test'

test.describe('Landing smoke', () => {
  test('home page shows product branding and sign-in', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('CheatSheet Studio').first()).toBeVisible()
    await expect(
      page.getByRole('heading', {
        name: /Build living cheat sheets/i,
      }),
    ).toBeVisible()
    // Sign-in CTA present (Google button copy may vary slightly)
    await expect(
      page.getByRole('button', { name: /sign in|google/i }).first(),
    ).toBeVisible()
  })

  test('unauthenticated /app redirects to landing', async ({ page }) => {
    await page.goto('/app')
    // AuthGate → Navigate to /
    await expect(page).toHaveURL(/\/$|\/\?/)
    await expect(page.getByText('CheatSheet Studio').first()).toBeVisible({
      timeout: 15_000,
    })
  })

  test('unknown route redirects home', async ({ page }) => {
    await page.goto('/no-such-route')
    await expect(page).toHaveURL(/\/$|\/\?/)
  })
})
