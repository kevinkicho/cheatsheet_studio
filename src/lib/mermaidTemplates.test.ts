import { describe, expect, it } from 'vitest'
import {
  MERMAID_KINDS,
  MERMAID_MINDMAP_EXAMPLE,
  applyFlowDirection,
  detectFlowDirection,
  detectMermaidKind,
  isProcessPanelKind,
  mermaidTemplate,
} from '@/lib/mermaidTemplates'

describe('mermaidTemplates', () => {
  it('offers flowchart and mind map in Process kinds', () => {
    expect(MERMAID_KINDS.map((k) => k.id)).toEqual(['flowchart', 'mindmap'])
  })

  it('builds flowchart templates with direction', () => {
    const src = mermaidTemplate('flowchart', 'LR')
    expect(src).toMatch(/^flowchart LR/m)
    expect(src).toContain('Start')
  })

  it('mindmap template is official Mermaid example (not flowchart)', () => {
    const src = mermaidTemplate('mindmap')
    expect(src).toBe(MERMAID_MINDMAP_EXAMPLE)
    expect(src).toMatch(/^mindmap\b/m)
    expect(src).toContain('root((mindmap))')
    expect(src).toContain('Tony Buzan')
    expect(src).not.toMatch(/^flowchart\b/m)
  })

  it('applyFlowDirection rewrites header', () => {
    const src = mermaidTemplate('flowchart', 'TD')
    const lr = applyFlowDirection(src, 'LR')
    expect(lr).toMatch(/^flowchart LR/m)
    expect(detectFlowDirection(lr)).toBe('LR')
  })

  it('detectMermaidKind recognizes families', () => {
    expect(detectMermaidKind(mermaidTemplate('mindmap'))).toBe('mindmap')
    expect(detectMermaidKind(mermaidTemplate('flowchart'))).toBe('flowchart')
    expect(detectMermaidKind('sequenceDiagram\n  A->>B: hi')).toBe('sequence')
  })

  it('isProcessPanelKind allows flowchart and mindmap only', () => {
    expect(isProcessPanelKind('flowchart')).toBe(true)
    expect(isProcessPanelKind('mindmap')).toBe(true)
    expect(isProcessPanelKind('pie')).toBe(false)
  })
})
