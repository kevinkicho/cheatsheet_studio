import katex from 'katex'

/**
 * Render LaTeX to KaTeX HTML (scalable vector type via web fonts).
 *
 * Pair with FitContent fitMethod="fontSize" so enlarge reflows KaTeX at the
 * target size instead of CSS-scaling a fixed raster. See docs/vector-graphics.md.
 *
 * New equations: store KaTeX-compatible LaTeX on the item’s `latex` field.
 */
export function renderLatexToHtml(latex: string, displayMode = true): string {
  try {
    return katex.renderToString(latex, {
      throwOnError: false,
      displayMode,
      strict: 'ignore',
      trust: false,
      // HTML + font output scales cleanly with parent font-size (vector type).
      output: 'html',
    })
  } catch {
    return `<span class="katex-error">${escapeHtml(latex)}</span>`
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
