import { useMemo } from 'react'
import { renderLatexToHtml } from '@/lib/katexRender'

interface LatexViewProps {
  latex: string
  displayMode?: boolean
  className?: string
}

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
