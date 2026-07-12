import { useEffect, useState, type ReactNode } from 'react'
import {
  DEFAULT_COLOR_PALETTE,
  hexForColorInput,
  loadRecentColors,
  rememberColor,
} from '@/lib/recentColors'

type Props = {
  value?: string
  /** Used when value is missing / non-hex (also shown as “Default” swatch). */
  defaultValue?: string
  onChange: (hex: string) => void
  disabled?: boolean
  className?: string
  /** Hide default palette strip (recent still shown). */
  hideDefaults?: boolean
  /** Compact layout for tight inspector panels. */
  compact?: boolean
  /** Right side of the selected-color row (e.g. Reset chip). */
  endAction?: ReactNode
  'aria-label'?: string
}

/**
 * Color control: native picker + default palette + recent picks (localStorage).
 */
export function ColorPicker({
  value,
  defaultValue = '#6366f1',
  onChange,
  disabled = false,
  className = '',
  hideDefaults = false,
  compact = false,
  endAction,
  'aria-label': ariaLabel = 'Color',
}: Props) {
  const hex = hexForColorInput(value, defaultValue)
  const [recent, setRecent] = useState<string[]>(() => loadRecentColors())

  useEffect(() => {
    const sync = () => setRecent(loadRecentColors())
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<string[]>).detail
      if (Array.isArray(detail)) setRecent(detail)
      else sync()
    }
    window.addEventListener('storage', sync)
    window.addEventListener('cheatsheet-recent-colors', onCustom)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('cheatsheet-recent-colors', onCustom)
    }
  }, [])

  const pick = (next: string) => {
    if (disabled) return
    const n = hexForColorInput(next, defaultValue)
    onChange(n)
    setRecent(rememberColor(n))
  }

  const defaults = hideDefaults
    ? []
    : DEFAULT_COLOR_PALETTE.filter((p) => p.hex !== defaultValue.toLowerCase())

  // Always surface the control’s default as first swatch
  const defaultSwatch = {
    hex: hexForColorInput(defaultValue, '#6366f1'),
    label: 'Default',
  }

  const swatchSize = compact ? 'h-5 w-5' : 'h-6 w-6'

  return (
    <div
      className={`flex flex-col gap-1.5 ${disabled ? 'opacity-40' : ''} ${className}`}
      data-testid="color-picker"
    >
      <div className="flex items-center gap-2">
        <label
          className={`relative shrink-0 overflow-hidden rounded-md border border-zinc-700 ${
            compact ? 'h-7 w-10' : 'h-8 w-12'
          } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
          title={ariaLabel}
        >
          <span
            className="absolute inset-0"
            style={{ background: hex }}
            aria-hidden
          />
          <input
            type="color"
            value={hex}
            disabled={disabled}
            aria-label={ariaLabel}
            onChange={(e) => pick(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
        </label>
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] tabular-nums text-zinc-500">
          {hex}
        </span>
        {endAction ? (
          <span className="ml-auto shrink-0">{endAction}</span>
        ) : null}
      </div>

      {/* Default option */}
      <div>
        <p className="mb-0.5 text-[8px] font-medium uppercase tracking-wide text-zinc-600">
          Default
        </p>
        <div className="flex flex-wrap gap-1">
          <Swatch
            hex={defaultSwatch.hex}
            label={defaultSwatch.label}
            active={hex === defaultSwatch.hex}
            size={swatchSize}
            disabled={disabled}
            onPick={pick}
          />
        </div>
      </div>

      {!hideDefaults && (
        <div>
          <p className="mb-0.5 text-[8px] font-medium uppercase tracking-wide text-zinc-600">
            Palette
          </p>
          <div className="flex flex-wrap gap-1">
            {defaults.map((p) => (
              <Swatch
                key={p.hex}
                hex={p.hex}
                label={p.label}
                active={hex === p.hex}
                size={swatchSize}
                disabled={disabled}
                onPick={pick}
              />
            ))}
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div>
          <p className="mb-0.5 text-[8px] font-medium uppercase tracking-wide text-zinc-600">
            Recent
          </p>
          <div className="flex flex-wrap gap-1">
            {recent.map((c) => (
              <Swatch
                key={c}
                hex={c}
                label={c}
                active={hex === c}
                size={swatchSize}
                disabled={disabled}
                onPick={pick}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Swatch({
  hex,
  label,
  active,
  size,
  disabled,
  onPick,
}: {
  hex: string
  label: string
  active: boolean
  size: string
  disabled?: boolean
  onPick: (hex: string) => void
}) {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={() => onPick(hex)}
      className={`${size} shrink-0 rounded-md border transition disabled:cursor-not-allowed ${
        active
          ? 'border-indigo-400 ring-1 ring-indigo-400/50'
          : 'border-zinc-700 hover:border-zinc-500'
      }`}
      style={{ background: hex }}
      aria-label={label}
      aria-pressed={active}
    />
  )
}
