import { describe, expect, it } from 'vitest'
import {
  applyFlowDirection,
  detectFlowDirection,
  detectMermaidKind,
  mermaidTemplate,
} from '@/lib/mermaidTemplates'

describe('mermaidTemplates', () => {
  it('builds flowchart templates with direction', () => {
    const src = mermaidTemplate('flowchart', 'LR')
    expect(src).toMatch(/^flowchart LR/m)
    expect(src).toContain('Start')
  })

  it('applyFlowDirection rewrites header', () => {
    const src = mermaidTemplate('flowchart', 'TD')
    const lr = applyFlowDirection(src, 'LR')
    expect(lr).toMatch(/^flowchart LR/m)
    expect(detectFlowDirection(lr)).toBe('LR')
  })

  it('detectMermaidKind recognizes families', () => {
    expect(detectMermaidKind(mermaidTemplate('sequence'))).toBe('sequence')
    expect(detectMermaidKind(mermaidTemplate('state'))).toBe('state')
    expect(detectMermaidKind(mermaidTemplate('pie'))).toBe('pie')
  })
})
