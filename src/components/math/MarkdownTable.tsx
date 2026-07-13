interface MarkdownTableProps {
  markdown: string
  className?: string
  /** Size to content instead of stretching to 100% width (canvas cards). */
  fitContent?: boolean
  /**
   * Light paper theme with inline hex colors only — safe for html2canvas-pro
   * (avoids Tailwind oklch utilities).
   */
  printTheme?: boolean
}

/** Parse GitHub-style pipe tables into row arrays (header separator stripped). */
export function parsePipeTable(markdown: string): string[][] {
  const text = markdown.trim()
  if (!text) return []
  return text
    .split('\n')
    .map((line) =>
      line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim()),
    )
    .filter(
      (r) =>
        r.length > 0 &&
        !(r.length === 1 && r[0] === '') &&
        !r.every((c) => /^[-:]*$/.test(c)),
    )
}

/**
 * Pipe-table renderer for library/canvas tables.
 *
 * VECTOR TYPE: uses em-based font/padding so FitContent `fontSize` fit grows
 * real text (not a CSS-scaled bitmap of a small table). Prefer this over
 * transform scale for canvas tables (see docs/vector-graphics.md).
 */
export function MarkdownTable({
  markdown,
  className = '',
  fitContent = false,
  printTheme = false,
}: MarkdownTableProps) {
  const rows = parsePipeTable(markdown)

  if (rows.length === 0) {
    if (printTheme) {
      return (
        <div style={{ fontSize: '0.85em', color: '#6b7280' }}>Empty table</div>
      )
    }
    return <div className="text-[0.85em] text-zinc-500">Empty table</div>
  }

  const [header, ...body] = rows

  if (printTheme) {
    return (
      <div style={{ overflow: fitContent ? 'visible' : 'auto' }}>
        <table
          style={{
            borderCollapse: 'collapse',
            textAlign: 'left',
            fontSize: '1em',
            lineHeight: 1.35,
            color: '#111827',
            width: fitContent ? 'max-content' : '100%',
            maxWidth: fitContent ? 'none' : undefined,
          }}
        >
          <thead>
            <tr>
              {header.map((cell, i) => (
                <th
                  key={i}
                  style={{
                    whiteSpace: 'nowrap',
                    borderBottom: '1px solid #9ca3af',
                    padding: '0.2em 0.4em',
                    fontWeight: 600,
                    color: '#3730a3',
                  }}
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr
                key={ri}
                style={{
                  background: ri % 2 === 1 ? 'rgba(0,0,0,0.03)' : 'transparent',
                }}
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    style={{
                      whiteSpace: 'nowrap',
                      borderBottom: '1px solid #e5e7eb',
                      padding: '0.2em 0.4em',
                      color: '#111827',
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div
      className={`${fitContent ? 'overflow-visible' : 'overflow-auto'} ${className}`}
    >
      <table
        className={`border-collapse text-left text-[1em] leading-snug text-zinc-200 ${
          fitContent ? 'w-max max-w-none' : 'w-full'
        }`}
      >
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th
                key={i}
                className="whitespace-nowrap border-b border-zinc-600 px-[0.4em] py-[0.2em] font-semibold text-indigo-200"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className="odd:bg-white/5">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="whitespace-nowrap border-b border-zinc-800 px-[0.4em] py-[0.2em]"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
