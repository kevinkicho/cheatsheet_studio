/**
 * Type-specific content editors for Item properties.
 * One selected card: edit payload fields appropriate to its kind.
 */
import type { ReactNode } from 'react'
import type { CalloutVariant, CanvasItem } from '@/types'
import { LatexView } from '@/components/math/LatexView'
import {
  cardKindLabel,
  constantToLatex,
  isProcessCard,
  matrixToLatex,
} from '@/lib/cardKinds'
import { useUiStore } from '@/stores/uiStore'

const CALLOUT_VARIANTS: { id: CalloutVariant; label: string }[] = [
  { id: 'note', label: 'Note' },
  { id: 'tip', label: 'Tip' },
  { id: 'info', label: 'Info' },
  { id: 'warn', label: 'Warn' },
  { id: 'danger', label: 'Danger' },
]

type Props = {
  item: CanvasItem
  /** Patch fields on this card (caller should bump contentFitKey). */
  onChange: (partial: Partial<CanvasItem>) => void
}

function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="text-[10px] leading-snug text-zinc-600">{hint}</span>
      ) : null}
    </label>
  )
}

function TextArea({
  value,
  onChange,
  rows = 4,
  mono = false,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  rows?: number
  mono?: boolean
  placeholder?: string
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      spellCheck={!mono}
      className={`field-input text-[11px] ${mono ? 'font-mono' : ''}`}
    />
  )
}

function TextInput({
  value,
  onChange,
  mono = false,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  mono?: boolean
  placeholder?: string
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      spellCheck={!mono}
      className={`field-input text-[11px] ${mono ? 'font-mono' : ''}`}
    />
  )
}

function LatexPreview({ latex }: { latex: string }) {
  if (!latex.trim()) {
    return (
      <p className="text-[10px] text-zinc-600">Enter LaTeX to preview…</p>
    )
  }
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-2">
      <p className="mb-1 text-[10px] uppercase text-zinc-500">Preview</p>
      <LatexView latex={latex} className="text-sm" />
    </div>
  )
}

/** Encode matrix rows as lines of cells joined by " | ". */
export function matrixRowsToEditor(rows: string[][] | undefined): string {
  if (!rows?.length) return ''
  return rows.map((r) => r.map((c) => c ?? '').join(' | ')).join('\n')
}

export function parseMatrixEditor(text: string): string[][] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line
        .split('|')
        .map((c) => c.trim())
        .filter((_, i, arr) => !(arr.length === 1 && arr[0] === '')),
    )
    .filter((r) => r.length > 0)
}

export function ItemBodyEditor({ item, onChange }: Props) {
  const beginEditProcessChart = useUiStore((s) => s.beginEditProcessChart)
  const kind = cardKindLabel(item.type)
  const t = item.type

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] text-zinc-500">
        <span className="font-medium text-zinc-400">{kind}</span>
        <span className="text-zinc-600"> · body content</span>
      </p>

      {(t === 'equation' || t === 'custom-equation') && (
        <>
          <Field label="LaTeX" hint="KaTeX-compatible math (display mode).">
            <TextArea
              value={item.latex ?? ''}
              onChange={(latex) => onChange({ latex })}
              rows={5}
              mono
              placeholder="e.g. E = mc^2"
            />
          </Field>
          <LatexPreview latex={item.latex ?? ''} />
        </>
      )}

      {t === 'table' && (
        <Field
          label="Markdown table"
          hint="GitHub-style pipe table. Header row + separator + body rows."
        >
          <TextArea
            value={item.tableMarkdown ?? ''}
            onChange={(tableMarkdown) => onChange({ tableMarkdown })}
            rows={8}
            mono
            placeholder={'| A | B |\n|---|---|\n| 1 | 2 |'}
          />
        </Field>
      )}

      {(t === 'figure' || t === 'custom-image' || t === 'plot') && (
        <Field
          label={t === 'plot' ? 'Plot image URL (SVG preferred)' : 'Image URL'}
          hint="data:image/svg+xml,… or https://… Prefer SVG for sharp resize."
        >
          <TextArea
            value={item.imageUrl ?? ''}
            onChange={(imageUrl) => onChange({ imageUrl })}
            rows={3}
            mono
            placeholder="data:image/svg+xml,…"
          />
        </Field>
      )}

      {t === 'definition' && (
        <>
          <Field label="Term">
            <TextInput
              value={item.term ?? ''}
              onChange={(term) => onChange({ term })}
              placeholder="Defined term"
            />
          </Field>
          <Field
            label="Definition"
            hint="Plain text. Wrap math in $...$ (inline) or $$...$$ (display), e.g. CAPM: $\\mathrm{E}[R_i]=R_f+\\beta_i(\\mathrm{E}[R_m]-R_f)$."
          >
            <TextArea
              value={item.body ?? ''}
              onChange={(body) => onChange({ body })}
              rows={5}
              placeholder={
                'Prose… CAPM: $\\mathrm{E}[R_i] = R_f + \\beta_i(\\mathrm{E}[R_m] - R_f)$.'
              }
            />
          </Field>
        </>
      )}

      {t === 'list' && (
        <>
          <Field
            label="List items"
            hint="One item per line."
          >
            <TextArea
              value={(item.listItems ?? []).join('\n')}
              onChange={(text) =>
                onChange({
                  listItems: text
                    .split('\n')
                    .map((s) => s.trimEnd())
                    .filter((s, i, arr) => s.length > 0 || i < arr.length - 1)
                    .filter((s) => s.length > 0),
                })
              }
              rows={6}
              placeholder={'First item\nSecond item'}
            />
          </Field>
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={item.listOrdered === true}
              onChange={(e) => onChange({ listOrdered: e.target.checked })}
              className="rounded border-zinc-600"
            />
            Numbered list (1, 2, 3…)
          </label>
        </>
      )}

      {t === 'callout' && (
        <>
          <Field label="Variant">
            <div className="flex flex-wrap gap-1">
              {CALLOUT_VARIANTS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onChange({ calloutVariant: id })}
                  className={`rounded-md border px-2 py-1 text-[10px] font-medium transition ${
                    (item.calloutVariant ?? 'note') === id
                      ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-200'
                      : 'border-zinc-800 bg-zinc-950/50 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Message">
            <TextArea
              value={item.body ?? ''}
              onChange={(body) => onChange({ body })}
              rows={4}
              placeholder="Callout text…"
            />
          </Field>
        </>
      )}

      {t === 'code' && (
        <>
          <Field label="Language" hint="Display label only (no highlighting yet).">
            <TextInput
              value={item.codeLanguage ?? ''}
              onChange={(codeLanguage) => onChange({ codeLanguage })}
              mono
              placeholder="python, pseudocode, …"
            />
          </Field>
          <Field label="Code">
            <TextArea
              value={item.code ?? ''}
              onChange={(code) => onChange({ code })}
              rows={8}
              mono
              placeholder="// code…"
            />
          </Field>
        </>
      )}

      {t === 'constant' && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Symbol">
              <TextInput
                value={item.symbol ?? ''}
                onChange={(symbol) => onChange({ symbol })}
                mono
                placeholder="c"
              />
            </Field>
            <Field label="Value">
              <TextInput
                value={item.value ?? ''}
                onChange={(value) => onChange({ value })}
                mono
                placeholder="2.998e8"
              />
            </Field>
            <Field label="Unit">
              <TextInput
                value={item.unit ?? ''}
                onChange={(unit) => onChange({ unit })}
                mono
                placeholder="m/s"
              />
            </Field>
          </div>
          <Field
            label="LaTeX (optional)"
            hint="If set, overrides symbol/value/unit for display."
          >
            <TextArea
              value={item.latex ?? ''}
              onChange={(latex) => onChange({ latex })}
              rows={2}
              mono
              placeholder="c = 2.998\\times 10^{8}\\,\\mathrm{m/s}"
            />
          </Field>
          <Field label="Note (optional)">
            <TextArea
              value={item.body ?? ''}
              onChange={(body) => onChange({ body })}
              rows={2}
              placeholder="Short note under the constant…"
            />
          </Field>
          <LatexPreview latex={constantToLatex(item)} />
        </>
      )}

      {t === 'identity-set' && (
        <>
          <Field
            label="Identities"
            hint="One KaTeX line per row."
          >
            <TextArea
              value={(item.identities ?? []).join('\n')}
              onChange={(text) =>
                onChange({
                  identities: text
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              rows={6}
              mono
              placeholder={'\\sin^2\\theta + \\cos^2\\theta = 1'}
            />
          </Field>
          {(item.identities ?? []).slice(0, 4).map((line, i) => (
            <LatexPreview key={i} latex={line} />
          ))}
        </>
      )}

      {t === 'matrix' && (
        <>
          <Field
            label="Matrix rows"
            hint="One row per line; cells separated by |  (e.g. a | b)"
          >
            <TextArea
              value={matrixRowsToEditor(item.matrixRows)}
              onChange={(text) =>
                onChange({ matrixRows: parseMatrixEditor(text) })
              }
              rows={4}
              mono
              placeholder={'a | b\nc | d'}
            />
          </Field>
          <Field
            label="LaTeX (optional override)"
            hint="If set, used instead of building a pmatrix from rows."
          >
            <TextArea
              value={item.latex ?? ''}
              onChange={(latex) => onChange({ latex })}
              rows={3}
              mono
              placeholder="\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}"
            />
          </Field>
          <LatexPreview latex={matrixToLatex(item)} />
        </>
      )}

      {isProcessCard(item) && (
        <>
          <Field
            label="Mermaid source"
            hint="Free-form editor snapshot (if any) paints the card; Mermaid is used when snapshot is cleared or for re-open."
          >
            <TextArea
              value={item.mermaidSource ?? ''}
              onChange={(mermaidSource) => onChange({ mermaidSource })}
              rows={8}
              mono
              placeholder={'flowchart TD\n  A --> B'}
            />
          </Field>
          <button
            type="button"
            onClick={() => beginEditProcessChart(item.id)}
            className="rounded-md border border-indigo-500/40 bg-indigo-500/10 px-2 py-1.5 text-[11px] font-medium text-indigo-200 hover:bg-indigo-500/20"
          >
            Open Process editor…
          </button>
        </>
      )}

      {/* Fallback for unknown / unhandled payloads */}
      {!isKnownBodyType(t) && !isProcessCard(item) && (
        <p className="text-[10px] text-zinc-600">
          No body fields for type “{t}”. Title and chrome still apply above.
        </p>
      )}
    </div>
  )
}

function isKnownBodyType(t: string): boolean {
  return (
    t === 'equation' ||
    t === 'custom-equation' ||
    t === 'table' ||
    t === 'figure' ||
    t === 'custom-image' ||
    t === 'plot' ||
    t === 'definition' ||
    t === 'list' ||
    t === 'callout' ||
    t === 'code' ||
    t === 'constant' ||
    t === 'identity-set' ||
    t === 'matrix' ||
    t === 'process-chart'
  )
}
