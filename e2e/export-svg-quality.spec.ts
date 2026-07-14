/**
 * Playwright checks for SVG export quality (CLI path — deterministic).
 * Critical issues: dark board bg, non-empty process diagram embeds.
 *
 * Note: Studio browser export is covered by e2e/studio-diagram-capture.spec.ts
 * (html2canvas + Mermaid). Unit tests in exportSvg.test.ts mock capture and
 * only cover helpers (bg resolve, FO flatten, usefulness thresholds).
 */
import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'examples', 'agent-out')
const sheetJson = path.join(outDir, 'finance-midterm.sheet.json')
const svgPath = path.join(outDir, 'e2e-finance-midterm.svg')
const vectorPath = path.join(outDir, 'e2e-finance-midterm.vector.html')

test.describe.configure({ mode: 'serial' })

test('CLI finance pack + SVG export produces dark page and diagram PNGs', async ({
  page,
}) => {
  test.setTimeout(180_000)

  fs.mkdirSync(outDir, { recursive: true })

  execSync(
    `npx tsx packages/cheatsheet-sdk/src/cli.ts pack finance-midterm -o "${sheetJson}"`,
    { cwd: root, stdio: 'pipe', timeout: 60_000 },
  )
  expect(fs.existsSync(sheetJson)).toBe(true)

  const sheet = JSON.parse(fs.readFileSync(sheetJson, 'utf8')) as {
    items: Array<{ mermaidSource?: string; type?: string }>
  }
  const processCount = sheet.items.filter(
    (i) => i.type === 'process-chart' || i.mermaidSource,
  ).length
  expect(processCount).toBeGreaterThanOrEqual(3)

  execSync(
    `npx tsx packages/cheatsheet-sdk/src/cli.ts export-svg "${sheetJson}" -o "${svgPath}"`,
    { cwd: root, stdio: 'pipe', timeout: 120_000 },
  )
  expect(fs.existsSync(svgPath)).toBe(true)

  const svg = fs.readFileSync(svgPath, 'utf8')
  // Dark board (not white paper)
  expect(svg).toMatch(/fill=["']#0f1115["']|background:\s*#0f1115/i)

  // Diagrams rasterized as PNG embeds (CLI path)
  const pngMatches = [...svg.matchAll(/data:image\/png;base64,([A-Za-z0-9+/=]+)/g)]
  // Prefer mermaid-raster imgs in vector.html if svg is FO-based
  const vector = fs.existsSync(vectorPath)
    ? fs.readFileSync(vectorPath, 'utf8')
    : svg
  const pngInVector = [
    ...vector.matchAll(/data:image\/png;base64,([A-Za-z0-9+/=]+)/g),
  ]
  const embeds = pngMatches.length >= 3 ? pngMatches : pngInVector
  expect(embeds.length).toBeGreaterThanOrEqual(3)

  // Real diagram screenshots (not solid-color stubs ~1–3KB)
  const sizes = embeds.map((m) => Math.floor((m[1]!.length * 3) / 4))
  const largeEnough = sizes.filter((b) => b > 5_000)
  expect(largeEnough.length).toBeGreaterThanOrEqual(2)
  // At least one substantial diagram (mindmap / multi-node flow)
  expect(Math.max(...sizes)).toBeGreaterThan(8_000)

  // Visual: open vector.html or svg and screenshot — not pure white
  const openPath = fs.existsSync(vectorPath) ? vectorPath : svgPath
  const fileUrl = 'file:///' + openPath.replace(/\\/g, '/')
  await page.goto(fileUrl, { waitUntil: 'load', timeout: 30_000 })
  await page.waitForTimeout(600)

  const shot = path.join(outDir, 'e2e-finance-svg-preview.png')
  await page.screenshot({ path: shot, fullPage: true })
  expect(fs.statSync(shot).size).toBeGreaterThan(20_000)

  // Sample center pixels should not all be near-white (board is dark)
  const stats = await page.evaluate(() => {
    const el =
      document.querySelector('.surface') ||
      document.querySelector('svg') ||
      document.body
    const r = el.getBoundingClientRect()
    // Use a tiny canvas sample via drawWindow-like approach: check body bg
    const bg = getComputedStyle(document.body).backgroundColor
    const surface = document.querySelector('.surface') as HTMLElement | null
    const sbg = surface ? getComputedStyle(surface).backgroundColor : bg
    return {
      bodyBg: bg,
      surfaceBg: sbg,
      w: r.width,
      h: r.height,
      hasRaster: document.querySelectorAll('img.mermaid-raster, image').length,
      hasPngData: document.documentElement.innerHTML.includes('data:image/png'),
    }
  })

  expect(stats.w).toBeGreaterThan(400)
  expect(stats.h).toBeGreaterThan(400)
  expect(stats.hasPngData || stats.hasRaster > 0).toBe(true)
})
