import type {
  CheatsheetLayoutOptions,
  AutoLayoutExportSnapshot,
} from './constants'
import {
  normalizePanelGroupLevels,
  normalizeLevelSubset,
  normalizeNgonLevels,
  normalizeGroupChrome,
  resolveLayoutGaps,
} from './constants'

export function sanitizeExportFileStem(raw: string): string {
  return (raw || 'cheatsheet')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '') // trailing dots/spaces break Windows
    .slice(0, 120) || 'cheatsheet'
}

/**
 * Compact tag of Auto-layout knobs for filenames, e.g.
 * `auto_sm_panels_ngon_L1-2_az_gap6`
 *
 * Decode: density · chrome · shape · levels · sort · panel gap px
 */
export function formatAutoLayoutFileTag(
  opts: Partial<CheatsheetLayoutOptions> | AutoLayoutExportSnapshot,
): string {
  const density = opts.density ?? 'sm'
  // Inline normalize (avoid circular import); legacy both → panels
  const chromeRaw = opts.groupChrome
  const chrome =
    chromeRaw === 'both'
      ? 'panels'
      : chromeRaw === 'labels' ||
          chromeRaw === 'panels' ||
          chromeRaw === 'none'
        ? chromeRaw
        : 'labels'
  const parts: string[] = ['auto', density, chrome]

  const panelsOn = chrome === 'panels'
  if (panelsOn) {
    const shape = opts.panelShape ?? 'rect'
    parts.push(shape === 'polygon' ? 'ngon' : 'rect')
    const legacyLevel =
      'panelGroupLevel' in opts
        ? (opts as Partial<CheatsheetLayoutOptions>).panelGroupLevel
        : undefined
    const levels = normalizePanelGroupLevels(opts.panelGroupLevels, legacyLevel)
    parts.push(`L${levels.join('-')}`)
    const borderLv = normalizeLevelSubset(
      opts.panelBorderLevels,
      levels,
      /* defaultOuterOnly */ true,
    )
    const outerOnly =
      borderLv.length === 1 && borderLv[0] === levels[0]
    if (!outerOnly) parts.push(`bL${borderLv.join('-')}`)
    if (shape === 'polygon') {
      const ngonLv = normalizeNgonLevels(
        opts.panelNgonLevels,
        borderLv,
        levels,
      )
      // Tag only when n-gon is a proper subset of borders (default = all
      // bordered levels → no extra nL fragment).
      const allBordersNgon =
        ngonLv.length === borderLv.length &&
        borderLv.every((L) => ngonLv.includes(L))
      if (ngonLv.length > 0 && !allBordersNgon) {
        parts.push(`nL${ngonLv.join('-')}`)
      }
    }
  }

  const sort = opts.groupSort ?? 'none'
  parts.push(
    sort === 'name-asc' ? 'az' : sort === 'name-desc' ? 'za' : 'nosort',
  )

  // Gap knobs: L1 panels · L2 panels · blocks · chrome pad
  const gaps = resolveLayoutGaps(opts)
  parts.push(`l1g${Math.round(gaps.l1PanelGap)}`)
  parts.push(`l2g${Math.round(gaps.l2PanelGap)}`)
  parts.push(`bg${Math.round(gaps.blockGap)}`)
  if (panelsOn) {
    parts.push(`pgap${Math.round(opts.panelPadding ?? 4)}`)
  }

  if (opts.multiPage === false) parts.push('1page')
  if (opts.dissolvePrintArea) parts.push('dissolve')

  return parts.join('_')
}

/**
 * Default download stem: `{sheetTitle}__{autoLayoutTag}` when layout was applied.
 */
export function buildExportFileNameStem(
  sheetTitle: string,
  layout?: AutoLayoutExportSnapshot | null,
): string {
  const base = sanitizeExportFileStem(sheetTitle)
  if (!layout) return base
  const tag = formatAutoLayoutFileTag(layout)
  // Keep combined stem under a practical download length
  const maxBase = Math.max(24, 160 - tag.length - 2)
  const shortBase =
    base.length > maxBase ? base.slice(0, maxBase).replace(/[. ]+$/g, '') : base
  return `${shortBase}__${tag}`
}

/** Pick a shareable snapshot from full pack options. */
export function snapshotAutoLayoutOptions(
  opts: CheatsheetLayoutOptions,
): AutoLayoutExportSnapshot {
  const gaps = resolveLayoutGaps(opts)
  return {
    density: opts.density ?? 'sm',
    groupChrome: normalizeGroupChrome(opts.groupChrome ?? 'labels'),
    panelShape: opts.panelShape,
    panelPadding: opts.panelPadding,
    panelGroupLevels: opts.panelGroupLevels,
    panelBorderLevels: opts.panelBorderLevels,
    panelNgonLevels: opts.panelNgonLevels,
    groupSort: opts.groupSort,
    gap: gaps.l1PanelGap,
    l1PanelGap: gaps.l1PanelGap,
    l2PanelGap: gaps.l2PanelGap,
    blockGap: gaps.blockGap,
    multiPage: opts.multiPage,
    dissolvePrintArea: opts.dissolvePrintArea,
  }
}
