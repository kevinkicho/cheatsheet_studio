/**
 * Renderers for Tier 1 prose + Tier 2 structured STEM cards
 * (definition, list, callout, code, constant, identity-set, matrix).
 * Vector-type: em fonts so FitContent fontSize fit stays sharp.
 *
 * Prose bodies (definition / list / callout) support mixed math:
 *   $...$   inline KaTeX
 *   $$...$$ display KaTeX
 */
import type { CSSProperties, ReactNode } from 'react'
import type { CanvasItem } from '@/types'
import { LatexView } from '@/components/math/LatexView'
import {
  CALLOUT_STYLES,
  calloutVariantOf,
  constantToLatex,
  matrixToLatex,
} from '@/lib/cardKinds'
import { parseProseMath } from '@/lib/proseMath'
import { renderLatexToHtml } from '@/lib/katexRender'

type Printish = { printTheme?: boolean }

/** Render body text with optional $ / $$ KaTeX segments. */
function ProseMathBody({
  text,
  printTheme = false,
  className = '',
  style,
}: {
  text: string
  printTheme?: boolean
  className?: string
  style?: CSSProperties
}) {
  const parts = parseProseMath(text)
  const onlyText = parts.every((p) => p.kind === 'text')

  if (onlyText) {
    return (
      <div className={className} style={style}>
        {text}
      </div>
    )
  }

  const nodes: ReactNode[] = parts.map((p, i) => {
    if (p.kind === 'text') {
      // Preserve newlines inside text segments
      return (
        <span key={i} className="whitespace-pre-wrap">
          {p.text}
        </span>
      )
    }
    if (printTheme) {
      // Export/print: inline KaTeX HTML so PDF still gets math
      const html = renderLatexToHtml(p.latex, p.display)
      return (
        <span
          key={i}
          className={
            p.display
              ? 'my-1 block overflow-visible [&_.katex]:text-[1em]'
              : 'inline-block overflow-visible align-middle [&_.katex]:text-[1em]'
          }
          // eslint-disable-next-line react/no-danger -- KaTeX HTML
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )
    }
    return (
      <LatexView
        key={i}
        latex={p.latex}
        displayMode={p.display}
        className={
          p.display
            ? 'my-1 block overflow-visible text-inherit [&_.katex]:text-[1em] [&_.katex-display]:m-0'
            : 'inline-block overflow-visible align-middle text-inherit [&_.katex]:text-[1em] [&_.katex-display]:m-0'
        }
      />
    )
  })

  return (
    <div className={className} style={style} data-prose-math>
      {nodes}
    </div>
  )
}

export function DefinitionView({
  item,
  printTheme = false,
}: { item: Pick<CanvasItem, 'term' | 'body' | 'title'> } & Printish) {
  const term = (item.term ?? item.title ?? '').trim()
  const body = (item.body ?? '').trim()
  if (printTheme) {
    return (
      <div
        style={{
          fontSize: '1em',
          lineHeight: 1.4,
          color: '#111827',
          maxWidth: 'max-content',
        }}
        data-card-kind="definition"
      >
        {term ? (
          <div style={{ fontWeight: 700, marginBottom: body ? 6 : 0 }}>
            {term}
          </div>
        ) : null}
        {body ? (
          <ProseMathBody
            text={body}
            printTheme
            style={{ color: '#374151' }}
          />
        ) : null}
      </div>
    )
  }
  return (
    <div
      className="max-w-full text-[1em] leading-snug text-inherit break-words"
      data-card-kind="definition"
      data-testid="card-definition"
    >
      {term ? (
        <div className={`font-semibold ${body ? 'mb-1.5' : ''} break-words`}>
          {term}
        </div>
      ) : null}
      {body ? (
        <ProseMathBody
          text={body}
          className="opacity-90 break-words"
        />
      ) : null}
    </div>
  )
}

export function ListView({
  item,
  printTheme = false,
}: {
  item: Pick<CanvasItem, 'listItems' | 'listOrdered'>
} & Printish) {
  const items = (item.listItems ?? []).map((s) => String(s).trim()).filter(Boolean)
  const ordered = item.listOrdered === true
  if (items.length === 0) {
    return printTheme ? (
      <div style={{ fontSize: '0.85em', color: '#6b7280' }}>Empty list</div>
    ) : (
      <div className="text-[0.85em] text-zinc-500">Empty list</div>
    )
  }
  const Tag = ordered ? 'ol' : 'ul'
  if (printTheme) {
    return (
      <Tag
        style={{
          fontSize: '1em',
          lineHeight: 1.4,
          color: '#111827',
          margin: 0,
          paddingLeft: '1.35em',
          maxWidth: 'max-content',
        }}
        data-card-kind="list"
      >
        {items.map((t, i) => (
          <li key={i} style={{ marginBottom: 4 }}>
            {t}
          </li>
        ))}
      </Tag>
    )
  }
  return (
    <Tag
      className={`max-w-full text-[1em] leading-snug text-inherit break-words ${
        ordered ? 'list-decimal' : 'list-disc'
      } pl-[1.35em]`}
      data-card-kind="list"
      data-testid="card-list"
    >
      {items.map((t, i) => (
        <li key={i} className="mb-1">
          <ProseMathBody text={t} className="inline" />
        </li>
      ))}
    </Tag>
  )
}

export function CalloutView({
  item,
  printTheme = false,
}: {
  item: Pick<CanvasItem, 'body' | 'calloutVariant' | 'title'>
} & Printish) {
  const variant = calloutVariantOf(item)
  const style = CALLOUT_STYLES[variant]
  const body = (item.body ?? '').trim()
  if (printTheme) {
    return (
      <div
        style={{
          fontSize: '1em',
          lineHeight: 1.4,
          color: '#111827',
          borderLeft: `4px solid ${style.accent}`,
          background: '#f8fafc',
          padding: '8px 10px',
          borderRadius: 4,
          maxWidth: 'max-content',
        }}
        data-card-kind="callout"
      >
        <div
          style={{
            fontWeight: 700,
            fontSize: '0.8em',
            color: style.accent,
            marginBottom: 4,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {style.label}
        </div>
        <ProseMathBody
          text={body || item.title || '…'}
          printTheme
        />
      </div>
    )
  }
  return (
    <div
      className="max-w-full rounded px-2.5 py-2 text-[1em] leading-snug text-inherit break-words"
      style={{
        borderLeft: `4px solid ${style.accent}`,
        background: style.bg,
        boxShadow: `inset 0 0 0 1px ${style.border}`,
      }}
      data-card-kind="callout"
      data-testid="card-callout"
    >
      <div
        className="mb-1 text-[0.75em] font-bold uppercase tracking-wide"
        style={{ color: style.accent }}
      >
        {style.label}
      </div>
      <ProseMathBody
        text={body || item.title || '…'}
        className="break-words opacity-95"
      />
    </div>
  )
}

export function CodeView({
  item,
  printTheme = false,
}: {
  item: Pick<CanvasItem, 'code' | 'codeLanguage'>
} & Printish) {
  const code = (item.code ?? '').replace(/\n$/, '')
  const lang = (item.codeLanguage ?? '').trim()
  if (printTheme) {
    return (
      <div style={{ maxWidth: 'max-content' }} data-card-kind="code">
        {lang ? (
          <div
            style={{
              fontSize: '0.7em',
              color: '#6b7280',
              marginBottom: 4,
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            {lang}
          </div>
        ) : null}
        <pre
          style={{
            margin: 0,
            fontSize: '0.9em',
            lineHeight: 1.35,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            color: '#111827',
            background: '#f3f4f6',
            padding: '8px 10px',
            borderRadius: 4,
            whiteSpace: 'pre',
          }}
        >
          {code || '// empty'}
        </pre>
      </div>
    )
  }
  return (
    <div className="max-w-max" data-card-kind="code" data-testid="card-code">
      {lang ? (
        <div className="mb-1 font-mono text-[0.7em] opacity-60">{lang}</div>
      ) : null}
      <pre className="m-0 whitespace-pre rounded bg-black/30 px-2.5 py-2 font-mono text-[0.9em] leading-snug text-inherit">
        {code || '// empty'}
      </pre>
    </div>
  )
}

export function ConstantView({
  item,
}: {
  item: Pick<CanvasItem, 'symbol' | 'value' | 'unit' | 'latex' | 'body'>
}) {
  const latex = constantToLatex(item)
  return (
    <div data-card-kind="constant" data-testid="card-constant">
      <LatexView
        latex={latex}
        className="overflow-visible text-inherit [&_.katex]:text-[1em] [&_.katex-display]:m-0"
      />
      {item.body?.trim() ? (
        <div className="mt-1.5 max-w-max text-[0.85em] opacity-80 whitespace-pre-wrap">
          {item.body.trim()}
        </div>
      ) : null}
    </div>
  )
}

export function IdentitySetView({
  item,
}: {
  item: Pick<CanvasItem, 'identities' | 'latex'>
}) {
  const lines =
    item.identities?.map((s) => s.trim()).filter(Boolean) ??
    (item.latex?.trim() ? [item.latex.trim()] : [])
  if (lines.length === 0) {
    return (
      <div className="text-[0.85em] text-zinc-500" data-card-kind="identity-set">
        Empty identity set
      </div>
    )
  }
  return (
    <div
      className="flex max-w-max flex-col gap-1.5"
      data-card-kind="identity-set"
      data-testid="card-identity-set"
    >
      {lines.map((latex, i) => (
        <LatexView
          key={i}
          latex={latex}
          className="overflow-visible text-inherit [&_.katex]:text-[1em] [&_.katex-display]:m-0"
        />
      ))}
    </div>
  )
}

export function MatrixView({
  item,
}: {
  item: Pick<CanvasItem, 'latex' | 'matrixRows'>
}) {
  const latex = matrixToLatex(item)
  if (!latex) {
    return (
      <div className="text-[0.85em] text-zinc-500" data-card-kind="matrix">
        Empty matrix
      </div>
    )
  }
  return (
    <div data-card-kind="matrix" data-testid="card-matrix">
      <LatexView
        latex={latex}
        className="overflow-visible text-inherit [&_.katex]:text-[1em] [&_.katex-display]:m-0"
      />
    </div>
  )
}
