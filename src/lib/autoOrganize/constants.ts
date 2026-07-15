import type { PanelShape } from '@/types'
import { DEFAULT_TITLE_FONT_SIZE } from '@/types'

/** Default snap / display grid (px). 24px aligns with 0.5″ Letter margins. */
export const ORGANIZE_GRID = 24
export const DEFAULT_GAP = 16

export type ContentDensity = 'xs' | 'sm' | 'md' | 'lg'

export type CheatsheetLayoutMode = 'columns' | 'flow'

/**
 * How topic/category groups are marked on the board after Auto-layout:
 * - **labels** — full-width (or region-width) heading banner rows
 * - **panels** — encapsulating frame around cards (no banner rows)
 * - **none** — dense pack only, no group chrome
 *
 * Legacy value `both` (labels+panels) is normalized to `panels`.
 */
export type GroupChrome = 'labels' | 'panels' | 'none'

/** @deprecated Use GroupChrome; `both` is accepted only for normalization. */
export type GroupChromeInput = GroupChrome | 'both'

export const GROUP_CHROME_PRESETS: Record<
  GroupChrome,
  { label: string; hint: string }
> = {
  labels: {
    label: 'Topic labels',
    hint: 'Category/topic banners as rows (columns of sections)',
  },
  panels: {
    label: 'Panels',
    hint: 'Encapsulating box around each related cluster',
  },
  none: {
    label: 'None',
    hint: 'Pack only — no group chrome',
  },
}

/** Map legacy `both` → panels; invalid → labels. */
export function normalizeGroupChrome(
  chrome?: string | null,
): GroupChrome {
  if (chrome === 'both') return 'panels'
  if (chrome === 'labels' || chrome === 'panels' || chrome === 'none') {
    return chrome
  }
  return 'labels'
}

/** Soft accents for panel frames (cycle by section index). */
export const LAYOUT_PANEL_ACCENTS = [
  'rgba(99, 102, 241, 0.55)', // indigo
  'rgba(16, 185, 129, 0.5)', // emerald
  'rgba(244, 114, 182, 0.5)', // pink
  'rgba(56, 189, 248, 0.5)', // sky
  'rgba(251, 191, 36, 0.5)', // amber
  'rgba(167, 139, 250, 0.5)', // violet
] as const

export type CheatsheetLayoutOptions = {
  /**
   * Distance between **L1 (outer) panel frames** (px). Default **4**.
   * Legacy alias: `gap` (same meaning).
   */
  l1PanelGap?: number
  /**
   * Distance between **L2 sibling panel frames** inside an L1 (px). Default **4**.
   */
  l2PanelGap?: number
  /**
   * Distance between **cards/blocks** inside a leaf pack (px). Default **4**.
   */
  blockGap?: number
  /**
   * @deprecated Prefer `l1PanelGap`. Kept for saved layouts / export tags.
   * When set without `l1PanelGap`, used as L1 panel gap.
   */
  gap?: number
  /** 1–3 or auto (guess from density + count). */
  columns?: number | 'auto'
  /**
   * How small content/cards get:
   * xs = densest midterm, lg = roomy study sheet.
   */
  density?: ContentDensity
  /** Pack into multi-column grid (default) or single-row flow wrap. */
  mode?: CheatsheetLayoutMode
  /**
   * Topic chrome: labels (banners), panels (frames), or none.
   * Legacy `both` is accepted and treated as `panels`.
   * Default `labels` (legacy cheatsheet rows of category labels).
   */
  groupChrome?: GroupChrome | 'both'
  /**
   * After packing, uniformly shrink so everything fits the print content box
   * when multiPage is false. With multiPage (default), content spans pages
   * instead of being crushed onto one frame.
   */
  fitPrint?: boolean
  /**
   * Prefer more pages instead of extreme shrink when overflowing.
   * Default **true** — kitchen-sink / midterm sheets need multipage.
   * Set false only for single-page dense midterms.
   */
  multiPage?: boolean
  /**
   * When true (default), items that share a Layers `folderId` pack as a
   * contiguous cluster (tight shelf) before the next folder — agent workflow.
   */
  groupByFolder?: boolean
  /**
   * Optional folder tree (from sheet.folders). Includes parentId for hierarchy.
   * Ungrouped (no folderId) packs last.
   */
  folders?: Array<{
    id: string
    order?: number
    name?: string
    parentId?: string | null
  }>
  /**
   * Panel chrome pad (px) from cards to the panel stroke. Default **4**.
   * Frame-to-frame air is controlled by `l1PanelGap` / `l2PanelGap`; pad is
   * only the inset inside each frame (and a floor so stroked frames don’t
   * overlap when gaps are small).
   */
  panelPadding?: number
  /**
   * Panel packing geometry when chrome includes panels:
   * - rect: tight box + standard gaps
   * - polygon (n-gon): tight box + denser flush packing
   */
  panelShape?: PanelShape
  /**
   * Order of topic/folder groups before packing.
   * - none: document order + densest packing (default)
   * - name-asc / name-desc: panels in readable name order
   */
  groupSort?: GroupSortOrder
  /**
   * Single hierarchy depth (legacy). Prefer `panelGroupLevels` multi-select.
   * When both set, `panelGroupLevels` wins.
   */
  panelGroupLevel?: PanelGroupLevel
  /**
   * Multi-select hierarchy depths for **nested** panels.
   * Example `[1, 2]`: outer panel per top folder (1, 2, 3…) wrapping inner
   * panels per subsection (1.1, 1.2…). Cards pack at the deepest selected level.
   * Default `[1]`.
   */
  panelGroupLevels?: PanelGroupLevel[]
  /**
   * Which group levels draw a **border stroke** (frame). Subset of
   * `panelGroupLevels`. Default: **outermost only** (legacy clean L1 frame).
   * Select L2/L3 here to show nested subsection borders.
   */
  panelBorderLevels?: PanelGroupLevel[]
  /**
   * Optional explicit n-gon levels (API/tests). Default when `panelShape` is
   * `polygon`: all `panelBorderLevels` (no per-level UI).
   */
  panelNgonLevels?: PanelGroupLevel[]
  /**
   * Merge contiguous print pages into one continuous pack band (free inter-page
   * margin gutters so max printable height/width grows). Auto-layout uses this
   * as its space budget; export can honor the same continuous area.
   */
  dissolvePrintArea?: boolean
}

/**
 * Snapshot of Auto-layout options used for export filenames / debugging shares.
 * (No folders — only user-facing pack knobs.)
 */
export type AutoLayoutExportSnapshot = {
  density: ContentDensity
  groupChrome: GroupChrome
  panelShape?: PanelShape
  panelPadding?: number
  panelGroupLevels?: PanelGroupLevel[]
  panelBorderLevels?: PanelGroupLevel[]
  panelNgonLevels?: PanelGroupLevel[]
  groupSort?: GroupSortOrder
  /** @deprecated → l1PanelGap */
  gap?: number
  l1PanelGap?: number
  l2PanelGap?: number
  blockGap?: number
  multiPage?: boolean
  dissolvePrintArea?: boolean
}

/** Resolve the three user gap knobs with legacy `gap` fallback. */
export function resolveLayoutGaps(options: {
  gap?: number
  l1PanelGap?: number
  l2PanelGap?: number
  blockGap?: number
}): { l1PanelGap: number; l2PanelGap: number; blockGap: number } {
  const legacy = Math.max(0, options.gap ?? 4)
  return {
    l1PanelGap: Math.max(0, options.l1PanelGap ?? legacy),
    l2PanelGap: Math.max(0, options.l2PanelGap ?? legacy),
    blockGap: Math.max(0, options.blockGap ?? 4),
  }
}

// Export filename helpers live in exportTags.ts (avoid star-export conflicts).

/**
 * Hierarchy depth for panel grouping (from tree root).
 * - `1` — top sections (1, 2, 3…)
 * - `2` — subsections (1.1, 1.2…)
 * - `3` — third level (1.1.a…); deeper paths clamp here
 */
export type PanelGroupLevel = 1 | 2 | 3

/** Normalize multi/single level options → sorted unique 1|2|3 (at least [1]). */
export function normalizePanelGroupLevels(
  levels?: PanelGroupLevel[] | null,
  legacy?: PanelGroupLevel | null,
): PanelGroupLevel[] {
  const raw =
    levels && levels.length > 0
      ? levels
      : legacy != null
        ? [legacy]
        : ([1] as PanelGroupLevel[])
  const set = new Set<PanelGroupLevel>()
  for (const L of raw) {
    const n = Math.min(3, Math.max(1, Math.floor(Number(L) || 1))) as PanelGroupLevel
    if (n === 1 || n === 2 || n === 3) set.add(n)
  }
  if (set.size === 0) set.add(1)
  return [...set].sort((a, b) => a - b)
}

/**
 * Subset of active group levels for border / n-gon toggles.
 * @param defaultOuterOnly when `levels` empty/undefined → only outermost of `available`
 */
export function normalizeLevelSubset(
  levels: PanelGroupLevel[] | null | undefined,
  available: PanelGroupLevel[],
  defaultOuterOnly = true,
): PanelGroupLevel[] {
  const avail = normalizePanelGroupLevels(available)
  if (avail.length === 0) return [1]
  if (!levels || levels.length === 0) {
    return defaultOuterOnly ? [avail[0]!] : avail
  }
  const set = new Set(avail)
  const out = normalizePanelGroupLevels(levels).filter((L) => set.has(L))
  return out.length > 0 ? out : [avail[0]!]
}

/**
 * Levels that use n-gon chrome when panel shape is polygon.
 * Default: **all stroked border levels** (per-level n-gon UI removed).
 * Explicit `levels` still filtered to borders for API/tests.
 */
export function normalizeNgonLevels(
  levels: PanelGroupLevel[] | null | undefined,
  borderLevels: PanelGroupLevel[],
  _groupLevels?: PanelGroupLevel[] | null,
): PanelGroupLevel[] {
  const borders = normalizePanelGroupLevels(borderLevels)
  if (borders.length === 0) return []
  if (levels && levels.length > 0) {
    const set = new Set(borders)
    return normalizePanelGroupLevels(levels).filter((L) => set.has(L))
  }
  // Default: every bordered level is n-gon when shape is polygon
  return borders
}

/** Sort groups by hierarchical folder/heading name. */
export type GroupSortOrder = 'none' | 'name-asc' | 'name-desc'

/** UI order for group-sort buttons (top → bottom). */
export const GROUP_SORT_ORDER: GroupSortOrder[] = [
  'name-asc',
  'name-desc',
  'none',
]

export const GROUP_SORT_PRESETS: Record<
  GroupSortOrder,
  { label: string; hint: string }
> = {
  'name-asc': {
    label: 'Name A→Z',
    hint: 'Free-flow with ascending flow: earlier names tend top-left → later bottom-right',
  },
  'name-desc': {
    label: 'Name Z→A',
    hint: 'Free-flow with descending flow: later names tend top-left → earlier bottom-right',
  },
  none: {
    label: 'No sorting',
    hint: 'Densest free-flow only (no name bias)',
  },
}

export const PANEL_SHAPE_PRESETS: Record<
  PanelShape,
  { label: string; hint: string }
> = {
  rect: {
    label: 'Rectangle',
    hint: 'Full box around the group (empty corner included)',
  },
  polygon: {
    label: 'N-gon (L-fill)',
    hint: 'Stepped/L chrome following card footprints (all bordered levels)',
  },
}
/**
 * Density presets — **must** produce clearly different card sizes and fonts.
 * Scales apply to content-native ideals; cards never go below readable mins
 * derived from font size (see `minCardForFonts`).
 */
export const DENSITY_PRESETS: Record<
  ContentDensity,
  {
    label: string
    hint: string
    /** Multiply estimateIdealBlockSize (equations/tables/figures). */
    sizeScale: number
    fontSize: number
    titleFontSize: number
    /** Process charts — slightly larger than equations at same density. */
    processSizeScale: number
  }
> = {
  xs: {
    label: 'Extra small',
    hint: 'Most cards per page — still readable KaTeX',
    sizeScale: 0.8,
    fontSize: 12,
    titleFontSize: 9,
    processSizeScale: 0.88,
  },
  sm: {
    label: 'Small',
    hint: 'Tight cheat sheet (recommended)',
    sizeScale: 0.95,
    fontSize: 14,
    titleFontSize: 10,
    processSizeScale: 1.0,
  },
  md: {
    label: 'Medium',
    hint: 'Balanced study layout — larger formulas',
    sizeScale: 1.15,
    fontSize: 16,
    titleFontSize: 11,
    processSizeScale: 1.18,
  },
  lg: {
    label: 'Large',
    hint: 'Roomy cards — exam-table readability',
    sizeScale: 1.4,
    fontSize: 18,
    titleFontSize: 12,
    processSizeScale: 1.35,
  },
}

/**
 * Minimum card outer size so title + one line of KaTeX stay visible
 * (prevents “empty tiny boxes” after aggressive density scale).
 */
export const MIN_READABLE_TITLE_FONT = DEFAULT_TITLE_FONT_SIZE

/** Smallest body (KaTeX) font after shrink. */
export const MIN_READABLE_BODY_FONT = 12

/**
 * When total ideal area exceeds this fraction of the page, shrink uniformly.
 * We never *grow* past ideal — oversized cards letterbox content (empty gutters).
 */
export const GRID_PACK_FILL_TARGET = 0.92
