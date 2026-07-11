interface MarkdownTableProps {
  markdown: string
  className?: string
  /** Size to content instead of stretching to 100% width (canvas cards). */
  fitContent?: boolean
}

/** Minimal pipe-table renderer for library/canvas tables. */
export function MarkdownTable({
  markdown,
  className = '',
  fitContent = false,
}: MarkdownTableProps) {
  const rows = markdown
    .trim()
    .split('\n')
    .map((line) =>
      line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim()),
    )
    .filter((r) => r.length > 0 && !r.every((c) => /^[-:]+$/.test(c)))

  if (rows.length === 0) {
    return <div className="text-xs text-zinc-500">Empty table</div>
  }

  const [header, ...body] = rows

  return (
    <div className={`${fitContent ? 'overflow-visible' : 'overflow-auto'} ${className}`}>
      <table
        className={`border-collapse text-left text-xs text-zinc-200 ${
          fitContent ? 'w-max max-w-none' : 'w-full'
        }`}
      >
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th
                key={i}
                className="whitespace-nowrap border-b border-zinc-600 px-2.5 py-1.5 font-semibold text-indigo-200"
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
                  className="whitespace-nowrap border-b border-zinc-800 px-2.5 py-1.5"
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
