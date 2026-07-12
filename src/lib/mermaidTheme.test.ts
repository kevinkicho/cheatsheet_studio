import { describe, expect, it } from 'vitest'
import {
  MERMAID_DARK_THEME_VARIABLES,
  STUDIO_DARK,
  applyStudioPaintToSvgString,
  mermaidInitOptions,
  mermaidSourceSupportsClassDef,
  prepareStudioDarkSource,
  usesStudioDarkVariables,
} from './mermaidTheme'

describe('mermaidTheme', () => {
  it('studio dark for dark UI themes', () => {
    expect(usesStudioDarkVariables('dark')).toBe(true)
    expect(usesStudioDarkVariables('forest')).toBe(false)
  })

  it('initialize uses base + themeVariables for studio dark', () => {
    const opts = mermaidInitOptions('dark', { studioDark: true })
    expect(opts.theme).toBe('base')
    expect(opts.themeVariables?.primaryColor).toBe(STUDIO_DARK.nodeFill)
    expect(opts.themeVariables?.mainBkg).toBe(STUDIO_DARK.nodeFill)
    expect(opts.themeVariables?.darkMode).toBe(true)
    // htmlLabels true so node boxes match label metrics (no clipped text)
    expect(opts.htmlLabels).toBe(true)
  })

  it('prepareStudioDarkSource adds frontmatter + classDef default', () => {
    const src = `flowchart TD
    A --> B`
    const out = prepareStudioDarkSource(src)
    expect(out.startsWith('---')).toBe(true)
    expect(out).toContain('theme: base')
    expect(out).toContain(`primaryColor: "${STUDIO_DARK.nodeFill}"`)
    expect(out).toContain(
      `classDef default fill:${STUDIO_DARK.nodeFill},stroke:${STUDIO_DARK.nodeStroke},color:${STUDIO_DARK.nodeText}`,
    )
    expect(out).toContain('flowchart TD')
  })

  it('prepareStudioDarkSource does not double frontmatter', () => {
    const src = `---
config:
  theme: base
---
flowchart TD
    A --> B`
    const out = prepareStudioDarkSource(src)
    // existing block kept (open+close ---); no second config: block prepended
    const beforeFlow = out.slice(0, out.indexOf('flowchart'))
    expect((beforeFlow.match(/^---/gm) || []).length).toBe(2)
    expect((beforeFlow.match(/config:/g) || []).length).toBe(1)
  })

  it('classDef only for flowchart/graph — not sequence or state', () => {
    expect(mermaidSourceSupportsClassDef('flowchart TD\n  A-->B')).toBe(true)
    expect(mermaidSourceSupportsClassDef('graph LR\n  A-->B')).toBe(true)
    expect(
      mermaidSourceSupportsClassDef(`sequenceDiagram
    A->>B: hi`),
    ).toBe(false)
    expect(
      mermaidSourceSupportsClassDef(`stateDiagram-v2
    [*] --> A`),
    ).toBe(false)

    const seq = prepareStudioDarkSource(`sequenceDiagram
    actor User
    User->>UI: hi`)
    expect(seq).toContain('---')
    expect(seq).toContain('sequenceDiagram')
    expect(seq).not.toMatch(/classDef/)

    const state = prepareStudioDarkSource(`stateDiagram-v2
    [*] --> Draft
    Draft --> [*]`)
    expect(state).toContain('stateDiagram-v2')
    expect(state).not.toMatch(/classDef/)

    const flow = prepareStudioDarkSource(`flowchart TD
    A --> B`)
    expect(flow).toMatch(/classDef default/)
  })

  it('hard paint rewrites pale default fills', () => {
    const raw = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg">
  <g class="node default" id="n-flowchart-A-0">
    <path d="M0 0h20v20z" fill="#ECECFF" stroke="none"></path>
    <path d="M0 0h20v20z" fill="none" stroke="#9370DB"></path>
    <text>A</text>
  </g>
</svg>`
    const out = applyStudioPaintToSvgString(raw)
    expect(out).toContain(STUDIO_DARK.nodeFill)
    expect(out).not.toContain('#ECECFF')
    expect(out).toContain('important')
    expect(out).toContain(STUDIO_DARK.nodeText)
  })

  it('forest is named theme only', () => {
    const opts = mermaidInitOptions('forest', { studioDark: false })
    expect(opts.theme).toBe('forest')
    expect(opts.themeVariables).toBeUndefined()
  })

  it('primaryColor matches STUDIO_DARK zinc fill', () => {
    expect(MERMAID_DARK_THEME_VARIABLES.primaryColor).toBe('#27272a')
    expect(STUDIO_DARK.nodeFill).toBe('#27272a')
  })

  it('layout font metrics stay 16px (prevents label overflow after paint)', () => {
    expect(MERMAID_DARK_THEME_VARIABLES.fontSize).toBe('16px')
    const opts = mermaidInitOptions('dark', { studioDark: true })
    expect(opts.themeVariables?.fontSize).toBe('16px')
  })
})
