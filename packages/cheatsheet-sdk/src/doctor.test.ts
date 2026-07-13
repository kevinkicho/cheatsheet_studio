import { describe, expect, it } from 'vitest'
import { runDoctor } from './doctor'

describe('runDoctor', () => {
  it('passes in monorepo (packs + catalog)', async () => {
    const r = await runDoctor()
    expect(r.checks.find((c) => c.name === 'topic-packs')?.ok).toBe(true)
    expect(r.checks.find((c) => c.name === 'seed-catalog')?.ok).toBe(true)
    expect(r.ok).toBe(true)
  })
})
