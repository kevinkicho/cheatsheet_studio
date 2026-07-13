import { createSheet, SheetBuilder } from './builder'
import type { SheetOutline } from './outline'
import type { SheetDocument } from './types'

/**
 * Compose a portable sheet from a high-level outline (agent-friendly).
 * Supports `catalog` blocks that resolve Studio seed items by id/title.
 */
export async function composeFromOutline(
  outline: SheetOutline,
): Promise<SheetDocument> {
  const builder = createSheet({
    title: outline.title,
    canvas: {
      printSizeId: outline.printSizeId ?? 'letter',
      orientation: outline.orientation ?? 'portrait',
    },
    meta: {
      createdBy: 'agent-outline',
      source: 'composeFromOutline',
      notes: outline.notes,
    },
  })

  for (const block of outline.blocks) {
    await applyBlock(builder, block)
  }

  if (outline.autoLayout !== false) {
    builder.autoLayout()
  }

  return builder.build()
}

/**
 * Append outline blocks onto an existing sheet (agent “add more content”).
 * Re-runs auto-layout on the full document when outline.autoLayout !== false.
 */
export async function appendOutlineToSheet(
  sheet: SheetDocument,
  outline: Pick<SheetOutline, 'blocks' | 'autoLayout' | 'notes'>,
): Promise<SheetDocument> {
  const builder = SheetBuilder.fromDocument(sheet)
  if (outline.notes) {
    builder.setMeta({
      notes: [sheet.meta?.notes, outline.notes].filter(Boolean).join(' · '),
    })
  }
  for (const block of outline.blocks) {
    await applyBlock(builder, block)
  }
  if (outline.autoLayout !== false) {
    builder.autoLayout()
  }
  return builder.build()
}

async function applyBlock(
  builder: SheetBuilder,
  block: SheetOutline['blocks'][number],
) {
  switch (block.type) {
    case 'catalog':
      await builder.addFromCatalog(block.id)
      return
    case 'equation':
      builder.addEquation({
        title: block.title ?? 'Equation',
        latex: block.latex,
      })
      return
    case 'table':
      builder.addTable({
        title: block.title ?? 'Table',
        tableMarkdown: block.markdown,
      })
      return
    case 'process':
      builder.addProcess({
        title: block.title,
        mermaidSource: block.mermaid,
        mermaidKind: block.kind === 'mindmap' ? 'mindmap' : 'flowchart',
      })
      return
    case 'figure':
      builder.addFigure({
        title: block.title ?? 'Figure',
        imageUrl: block.imageUrl,
      })
      return
    case 'heading':
      builder.addEquation({
        title: block.title,
        latex: block.note
          ? `\\text{${escapeLatexText(block.note)}}`
          : `\\text{${escapeLatexText(block.title)}}`,
        height: 56,
        width: 520,
      })
      return
    default:
      return
  }
}

function escapeLatexText(s: string): string {
  return s
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[{}]/g, '')
    .replace(/[%&#_$]/g, '')
}
