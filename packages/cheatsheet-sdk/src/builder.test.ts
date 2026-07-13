import { describe, expect, it } from 'vitest'
import { createSheet, SheetBuilder } from './builder'
import { composeFromOutline } from './compose'
import { validateSheetDocument } from './validate'
import { autoLayoutItems } from './layout'
import { defaultCanvas } from './defaults'

describe('@cheatsheet-studio/sdk builder', () => {
  it('builds a valid sheet with equation + table + process', () => {
    const sheet = createSheet({ title: 'Agent demo' })
      .addEquation({ title: 'Energy', latex: 'E=mc^2' })
      .addTable({
        title: 'Pairs',
        tableMarkdown: '| a | b |\n|---|---|\n| 1 | 2 |',
      })
      .addProcess({
        title: 'Flow',
        mermaidSource: 'flowchart TD\n  A-->B',
      })
      .autoLayout()
      .build()

    expect(sheet.v).toBe(1)
    expect(sheet.title).toBe('Agent demo')
    expect(sheet.items).toHaveLength(3)
    expect(sheet.items[0]!.type).toBe('equation')
    expect(sheet.items[1]!.type).toBe('table')
    expect(sheet.items[2]!.type).toBe('process-chart')

    const v = validateSheetDocument(sheet)
    expect(v.ok).toBe(true)
  })

  it('rejects invalid equation without latex', () => {
    const bad = {
      v: 1,
      title: 'x',
      canvas: defaultCanvas(),
      items: [
        {
          id: 'e1',
          type: 'equation',
          x: 0,
          y: 0,
          width: 100,
          height: 40,
          zIndex: 1,
        },
      ],
      folders: [],
    }
    const v = validateSheetDocument(bad)
    expect(v.ok).toBe(false)
  })

  it('autoLayout places items below the margin top', () => {
    const canvas = defaultCanvas()
    const items = createSheet()
      .addEquation({ latex: 'a+b' })
      .addEquation({ latex: 'c+d' })
      .toDocument().items
    const laid = autoLayoutItems(items, canvas)
    expect(laid[0]!.y).toBe(canvas.margins.top)
    expect(laid[1]!.y).toBeGreaterThan(laid[0]!.y)
  })

  it('toFirestorePayload includes ownerId and items', () => {
    const payload = createSheet({ title: 'Cloud' })
      .addEquation({ latex: '1+1' })
      .toFirestorePayload('uid-abc')
    expect(payload.ownerId).toBe('uid-abc')
    expect(payload.title).toBe('Cloud')
    expect(payload.items).toHaveLength(1)
    expect(payload.createdAt).toBeDefined()
  })

  it('fromDocument round-trips', () => {
    const a = createSheet({ title: 'R' }).addEquation({ latex: 'x' }).build()
    const b = SheetBuilder.fromDocument(a).addEquation({ latex: 'y' }).build()
    expect(b.items).toHaveLength(2)
    expect(b.title).toBe('R')
  })

  it('composeFromOutline builds multi-block sheet', async () => {
    const sheet = await composeFromOutline({
      title: 'Outline demo',
      blocks: [
        { type: 'heading', title: 'Section A' },
        { type: 'equation', latex: 'a+b', title: 'Sum' },
        {
          type: 'process',
          mermaid: 'flowchart TD\n  X-->Y',
          kind: 'flowchart',
        },
      ],
    })
    expect(sheet.title).toBe('Outline demo')
    expect(sheet.items.length).toBeGreaterThanOrEqual(3)
    expect(validateSheetDocument(sheet).ok).toBe(true)
  })
})
