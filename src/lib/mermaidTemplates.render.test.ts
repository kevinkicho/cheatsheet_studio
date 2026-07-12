/**
 * Process templates must survive studio dark source prep without Mermaid parse errors.
 */
import { describe, expect, it, beforeAll } from 'vitest'
import mermaid from 'mermaid'
import { MERMAID_KINDS, mermaidTemplate } from './mermaidTemplates'
import {
  mermaidInitOptions,
  mermaidSourceSupportsClassDef,
  prepareStudioDarkSource,
} from './mermaidTheme'
import type { MermaidDiagramKind } from '@/types'

beforeAll(() => {
  mermaid.initialize(mermaidInitOptions('dark', { studioDark: true }))
})

describe('Process chart templates × studio dark prep', () => {
  it.each(MERMAID_KINDS.map((k) => k.id))(
    'kind %s: classDef only when flowchart/graph',
    (kind: MermaidDiagramKind) => {
      const src = mermaidTemplate(kind, 'TD')
      const prepared = prepareStudioDarkSource(src)
      const expectsClassDef = kind === 'flowchart'
      expect(mermaidSourceSupportsClassDef(src)).toBe(expectsClassDef)
      if (expectsClassDef) {
        expect(prepared).toMatch(/classDef default/)
      } else {
        expect(prepared).not.toMatch(/classDef/)
      }
      expect(prepared.startsWith('---')).toBe(true)
    },
  )

  it.each(MERMAID_KINDS.map((k) => [k.id, k.label] as const))(
    'kind %s (%s) parses after prepareStudioDarkSource',
    async (kind: MermaidDiagramKind) => {
      const source = mermaidTemplate(kind, 'TD')
      const prepared = prepareStudioDarkSource(source)
      await expect(mermaid.parse(prepared)).resolves.toBeTruthy()
    },
  )

  it('raw templates also parse (no prep regression)', async () => {
    for (const k of MERMAID_KINDS) {
      const src = mermaidTemplate(k.id, 'TD')
      await expect(mermaid.parse(src)).resolves.toBeTruthy()
    }
  })
})
