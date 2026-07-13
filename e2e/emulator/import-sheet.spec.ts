import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync, mkdirSync } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Import JSON path against Auth emulator.
 * Fixture is a minimal agent SheetDocument (no need for full midterm).
 */
test.describe('Emulator Import JSON', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('emulator-banner').first()).toBeVisible({
      timeout: 20_000,
    })
    await page.getByTestId('emulator-sign-in').first().click()
    await expect(page).toHaveURL(/\/app/, { timeout: 30_000 })
    await expect(page.locator('#main-canvas-surface')).toBeVisible({
      timeout: 30_000,
    })
  })

  test('imports agent sheet JSON via top-bar file input', async ({ page }) => {
    const dir = path.join(__dirname, '../../test-results/e2e-fixtures')
    mkdirSync(dir, { recursive: true })
    const fixture = path.join(dir, 'e2e-import.sheet.json')
    const doc = {
      v: 1,
      title: 'E2E Import Midterm',
      canvas: {
        width: 900,
        height: 1100,
        printSizeId: 'letter',
        orientation: 'portrait',
        showPrintArea: true,
        printPageCount: 1,
      },
      items: [
        {
          id: 'eq1',
          type: 'equation',
          title: 'PV',
          x: 48,
          y: 48,
          width: 280,
          height: 80,
          zIndex: 1,
          latex: 'PV = \\frac{FV}{(1+r)^n}',
        },
        {
          id: 'eq2',
          type: 'equation',
          title: 'NPV',
          x: 48,
          y: 140,
          width: 320,
          height: 90,
          zIndex: 2,
          latex: '\\mathrm{NPV}=-C_0+\\sum_t C_t/(1+r)^t',
        },
      ],
      folders: [],
    }
    writeFileSync(fixture, JSON.stringify(doc, null, 2), 'utf8')

    const input = page.getByTestId('import-sheet-json-input')
    await expect(input).toBeAttached({ timeout: 10_000 })
    await input.setInputFiles(fixture)

    // Toast or canvas cards
    await expect
      .poll(async () => page.locator('[data-canvas-item]').count(), {
        timeout: 20_000,
      })
      .toBeGreaterThanOrEqual(2)

    await expect(page.getByTestId('app-toast')).toBeVisible({ timeout: 8_000 })
    await expect(page.getByTestId('app-toast')).toContainText(/Imported|E2E/i)
  })
})
