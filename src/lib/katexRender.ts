import katex from 'katex'

export function renderLatexToHtml(latex: string, displayMode = true): string {
  try {
    return katex.renderToString(latex, {
      throwOnError: false,
      displayMode,
      strict: 'ignore',
      trust: false,
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
