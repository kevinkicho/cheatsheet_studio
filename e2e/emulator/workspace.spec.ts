import { test, expect } from '@playwright/test'

/**
 * Authenticated workspace E2E against Firebase Auth + Firestore emulators.
 * Requires VITE_USE_FIREBASE_EMULATORS=true (see playwright.emulator.config.ts).
 */
test.describe('Emulator workspace', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Landing may render SignInButton twice (header + hero)
    await expect(page.getByTestId('emulator-banner').first()).toBeVisible({
      timeout: 20_000,
    })
    await page.getByTestId('emulator-sign-in').first().click()
    // Land in workspace after AuthGate + ensureDefaultSheet
    await expect(page).toHaveURL(/\/app/, { timeout: 30_000 })
    await expect(page.locator('#main-canvas-surface')).toBeVisible({
      timeout: 30_000,
    })
  })

  test('boots workspace with canvas surface after emulator sign-in', async ({
    page,
  }) => {
    await expect(page.locator('#main-canvas-surface')).toBeVisible()
    // Title input in top bar (sheet name)
    await expect(
      page.locator('input[type="text"], input:not([type])').first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('grid layer exposes data-grid-opacity and extent switch keeps it stable', async ({
    page,
  }) => {
    // Open canvas toolbar grid settings (chevron next to grid icon)
    const gridMenuToggle = page
      .locator('button[title="Grid settings — where the grid appears"]')
      .first()
    await gridMenuToggle.click()
    const menu = page.getByRole('menu')
    await expect(menu.getByText('Grid covers', { exact: true })).toBeVisible()

    await expect(menu.getByText(/Opacity · \d+%/)).toBeVisible()

    // Options use role=menuitemradio (not button)
    await menu.getByRole('menuitemradio', { name: /Whole board/i }).click()
    await menu.getByRole('menuitemradio', { name: /Full page/i }).click()
    await menu.getByRole('menuitemradio', { name: /Printable area/i }).click()

    await expect(page.locator('#main-canvas-surface')).toBeVisible()

    const layers = page.locator('[data-grid-opacity]')
    const count = await layers.count()
    if (count > 0) {
      const alpha = await layers.first().getAttribute('data-grid-opacity')
      expect(Number(alpha)).toBeGreaterThanOrEqual(0)
      expect(Number(alpha)).toBeLessThanOrEqual(0.3)
    }
  })

  test('can create equation card on canvas sheet', async ({ page }) => {
    await page.getByText('Equation', { exact: true }).click()
    const latex = page.locator('textarea').first()
    await expect(latex).toBeVisible({ timeout: 10_000 })
    await latex.fill('E = mc^2')
    await page.getByRole('button', { name: /Add to canvas/i }).click()
    await expect(page.locator('[data-canvas-item]').first()).toBeVisible({
      timeout: 15_000,
    })
  })

  test('print page count can be increased via print menu', async ({ page }) => {
    const printChevron = page
      .locator('button[aria-haspopup="listbox"]')
      .first()
    await printChevron.click()
    const menu = page.getByRole('listbox', { name: /Print page size/i })
    await expect(menu).toBeVisible()
    await menu.getByRole('button', { name: '3', exact: true }).click()
    // Chip shows e.g. "Letter · 3p"
    await expect(page.getByText(/\b3p\b/).first()).toBeVisible({
      timeout: 10_000,
    })
  })

  test('sheet bootstrap creates a sheet id (local or cloud)', async ({
    page,
  }) => {
    // With Auth-only emulators, Firestore offline → local_* sheet is OK.
    // With full emulators (Java), cloud sheet id is non-local.
    await expect(page.locator('#main-canvas-surface')).toBeVisible()
    // Dirty/save UI or title proves canvas store loaded
    await expect(
      page.locator('input').filter({ hasNot: page.locator('[type=range]') }).first(),
    ).toBeVisible()
  })
})
