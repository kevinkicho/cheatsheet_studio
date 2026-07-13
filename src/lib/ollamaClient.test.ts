import { describe, expect, it } from 'vitest'
import { parseJsonFromModel, stripThinkingNoise } from './ollamaClient'

describe('ollamaClient helpers', () => {
  it('strips code fences and parses JSON', () => {
    const raw = '```json\n{"density":"sm","gap":8}\n```'
    const obj = parseJsonFromModel<{ density: string; gap: number }>(raw)
    expect(obj.density).toBe('sm')
    expect(obj.gap).toBe(8)
  })

  it('stripThinkingNoise removes channel markers', () => {
    const s = stripThinkingNoise(
      '<|channel|>thought\nthinking…<channel|>{"density":"xs"}',
    )
    expect(s).toContain('density')
    expect(s).not.toMatch(/thought/)
  })
})
