import { describe, expect, it } from 'vitest'
import {
  MERMAID_DARK_THEME_VARIABLES,
  STUDIO_DARK,
  applyStudioPaintToSvgString,
  mermaidInitOptions,
  prepareStudioDarkSource,
  usesStudioDarkVariables,
} from './mermaidTheme'

describe('mermaidTheme', () => {
  it('studio dark for dark UI themes', () => {
    expect(usesStudioDarkVariables('dark')).toBe(true)
    expect(usesStudioDarkVariables('forest')).toBe(false)
  })

  it('initialize uses base + themeVariables (verify-app-stack)', () => {
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

  it('hard paint rewrites pale fills like verify-v5', () => {
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

  it('primaryColor matches STUDIO_DARK (verify-app-stack #27272a)', () => {
    expect(MERMAID_DARK_THEME_VARIABLES.primaryColor).toBe('#27272a')
    expect(STUDIO_DARK.nodeFill).toBe('#27272a')
  })

  it('layout font metrics stay 16px (prevents label overflow after paint)', () => {
    expect(MERMAID_DARK_THEME_VARIABLES.fontSize).toBe('16px')
    const opts = mermaidInitOptions('dark', { studioDark: true })
    expect(opts.themeVariables?.fontSize).toBe('16px')
  })
})
