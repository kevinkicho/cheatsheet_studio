import { describe, expect, it } from 'vitest'
import { resolveCloudAuth } from './auth'
import path from 'node:path'
import { writeFileSync, mkdirSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'

describe('resolveCloudAuth', () => {
  it('throws when no SA path', () => {
    const prev = process.env.CHEATSHEET_SA_PATH
    const prevG = process.env.GOOGLE_APPLICATION_CREDENTIALS
    delete process.env.CHEATSHEET_SA_PATH
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS
    expect(() => resolveCloudAuth()).toThrow(/CHEATSHEET_SA_PATH/)
    if (prev) process.env.CHEATSHEET_SA_PATH = prev
    if (prevG) process.env.GOOGLE_APPLICATION_CREDENTIALS = prevG
  })

  it('resolves explicit sa path and uid', () => {
    const dir = path.join(tmpdir(), 'cheatsheet-auth-test')
    mkdirSync(dir, { recursive: true })
    const sa = path.join(dir, 'sa.json')
    writeFileSync(sa, '{}')
    const cfg = resolveCloudAuth({ sa, uid: 'user-1', projectId: 'p1' })
    expect(cfg.ownerUid).toBe('user-1')
    expect(cfg.projectId).toBe('p1')
    expect(cfg.serviceAccountPath).toContain('sa.json')
    unlinkSync(sa)
  })
})
