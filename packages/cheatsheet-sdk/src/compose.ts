import { createSheet, type SheetBuilder } from './builder'
import type { SheetOutline } from './outline'
import type { SheetDocument } from './types'

/**
 * Compose a portable sheet from a high-level outline (agent-friendly).
 */
export function composeFromOutline(outline: SheetOutline): SheetDocument {
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
    applyBlock(builder, block)
  }

  if (outline.autoLayout !== false) {
    builder.autoLayout()
  }

  return builder.build()
}

function applyBlock(builder: SheetBuilder, block: SheetOutline['blocks'][number]) {
  switch (block.type) {
    case 'equation':
      builder.addEquation({
        title: block.title ?? 'Equation',
        latex: block.latex,
      })
      break
    case 'table':
      builder.addTable({
        title: block.title ?? 'Table',
        tableMarkdown: block.markdown,
      })
      break
    case 'process':
      builder.addProcess({
        title: block.title,
        mermaidSource: block.mermaid,
        mermaidKind: block.kind === 'mindmap' ? 'mindmap' : 'flowchart',
      })
      break
    case 'figure':
      builder.addFigure({
        title: block.title ?? 'Figure',
        imageUrl: block.imageUrl,
      })
      break
    case 'heading':
      // Lightweight section label as a short equation card with text-only latex
      builder.addEquation({
        title: block.title,
        latex: block.note
          ? `\\text{${escapeLatexText(block.note)}}`
          : `\\text{${escapeLatexText(block.title)}}`,
        height: 56,
        width: 520,
      })
      break
    default:
      break
  }
}

function escapeLatexText(s: string): string {
  return s
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[{}]/g, '')
    .replace(/[%&#_$]/g, '')
}
