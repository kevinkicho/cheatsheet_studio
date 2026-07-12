import { useMemo } from 'react'
import { renderLatexToHtml } from '@/lib/katexRender'

interface LatexViewProps {
  latex: string
  displayMode?: boolean
  className?: string
}

/**
 * Renders KaTeX HTML from LaTeX. Scales as vector type when the parent
 * font-size changes (FitContent fitMethod="fontSize"). See docs/vector-graphics.md.
 */
export function LatexView({
  latex,
  displayMode = true,
  className = '',
}: LatexViewProps) {
  const html = useMemo(
    () => renderLatexToHtml(latex || '\\;', displayMode),
    [latex, displayMode],
  )

  return (
    <div
      className={`katex-host ${className.includes('overflow') ? '' : 'overflow-auto'} ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
