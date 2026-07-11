import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Guards the localhost:5173 vs :5000 confusion:
 * firebase serve only ships `dist/`. If tests pass but :5000 is stale,
 * rebuild (`npm run build`) before `firebase serve`.
 */
describe('deploy / firebase serve guardrails', () => {
  const root = path.resolve(__dirname, '../..')

  it('firebase hosting public dir is dist', () => {
    const cfg = JSON.parse(
      readFileSync(path.join(root, 'firebase.json'), 'utf8'),
    ) as { hosting?: { public?: string } }
    expect(cfg.hosting?.public).toBe('dist')
  })

  it('package.json has build and test scripts', () => {
    const pkg = JSON.parse(
      readFileSync(path.join(root, 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> }
    expect(pkg.scripts?.build).toBeTruthy()
    expect(pkg.scripts?.test).toMatch(/vitest/)
  })

  it('documents that dist may lag source (informational if dist missing)', () => {
    // Not failing the suite if dist is absent (CI can skip build);
    // but when dist exists, index.html should reference hashed assets.
    const indexPath = path.join(root, 'dist/index.html')
    if (!existsSync(indexPath)) {
      expect(true).toBe(true)
      return
    }
    const html = readFileSync(indexPath, 'utf8')
    expect(html).toMatch(/assets\/index-.*\.js/)
  })
})
