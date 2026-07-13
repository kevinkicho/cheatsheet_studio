import {
  DEFAULT_BORDER_COLOR,
  DEFAULT_ITEM_STYLE,
  type BorderStroke,
  type CanvasItem,
  type CanvasItemType,
  type ItemStyle,
  type TitleAlign,
} from '@/types'

/** Build CSS `border` from structured stroke fields. */
export function composeBorderCss(style: ItemStyle | undefined): string {
  const s = style ?? {}
  if (s.borderEnabled === false || s.borderStyle === 'none') {
    return 'none'
  }
  // Legacy: only a border shorthand was stored
  if (
    s.borderWidth === undefined &&
    s.borderStyle === undefined &&
    s.borderColor === undefined &&
    s.borderEnabled === undefined &&
    s.border
  ) {
    if (s.border === 'none' || s.border.includes('transparent')) {
      return s.border.includes('transparent') ? 'none' : s.border
    }
    return s.border
  }
  const width = Math.max(0, s.borderWidth ?? 1)
  if (width === 0) return 'none'
  const stroke: BorderStroke = s.borderStyle ?? 'solid'
  const color = s.borderColor ?? DEFAULT_BORDER_COLOR
  return `${width}px ${stroke} ${color}`
}

/** Merge style patches and keep `border` shorthand in sync. */
export function withBorderStyle(
  current: ItemStyle | undefined,
  patch: Partial<ItemStyle>,
): ItemStyle {
  const next = { ...DEFAULT_ITEM_STYLE, ...current, ...patch }
  next.border = composeBorderCss(next)
  return next
}

/** Figure / custom image (not equation or table). */
export function isFigureLike(
  item: Pick<
    CanvasItem,
    'type' | 'imageUrl' | 'latex' | 'tableMarkdown' | 'mermaidSource'
  >,
): boolean {
  if (item.type === 'process-chart' || item.mermaidSource) return false
  return (
    item.type === 'figure' ||
    item.type === 'custom-image' ||
    (Boolean(item.imageUrl) && !item.latex && !item.tableMarkdown)
  )
}

export function isProcessChart(
  item: Pick<CanvasItem, 'type' | 'mermaidSource'>,
): boolean {
  return item.type === 'process-chart' || Boolean(item.mermaidSource)
}

/**
 * App-wide card defaults:
 * - Equations: KaTeX via font-size fit (vector type, sharp when resized)
 * - Figures: inline SVG at card display size (vector)
 * - Process charts: Mermaid SVG fillContainer (vector)
 * - Background fill ON for all types (turn off via Properties)
 * - contentFill ON so content tracks card resize
 *
 * New equations and figures are authored as vector graphics (LaTeX / SVG).
 * See docs/vector-graphics.md.
 */
export const CARD_DEFAULTS = {
  contentFill: true as const,
  /** Uniform scale (aspect locked). Off = independent X/Y stretch on resize. */
  keepAspectRatio: true as const,
  showTitle: true as const,
  titleAlign: 'left' as TitleAlign,
  /** Card title bar font size (px). */
  titleFontSize: 10 as const,
  /** Background fill on unless user opts out (transparentBackground: true). */
  backgroundFill: true as const,
  /**
   * Card inner padding (px). 0 so free-transform stretch-fill uses the full
   * card; avoid “baked-in” gutters that couple axis resizes.
   */
  padding: 0,
  maxFillScale: 64,
  minFitScale: 0.08,
  /**
   * Equations with keepAspectRatio: scale via font-size so KaTeX reflows as
   * vector type when the card grows (docs/vector-graphics.md).
   */
  equationFitMethod: 'fontSize' as const,
  panelBackground: 'rgba(30, 32, 40, 0.92)',
  borderEnabled: true as const,
  borderWidth: 1,
  borderStyle: 'solid' as BorderStroke,
  borderColor: DEFAULT_BORDER_COLOR,
}

/** Old baked defaults — migrate to 0 padding on load. */
const LEGACY_CARD_PADS = new Set([4, 8, 10, 12])

export function solidPanelStyle(overrides?: Partial<ItemStyle>): ItemStyle {
  return withBorderStyle(
    {
      ...DEFAULT_ITEM_STYLE,
      background: CARD_DEFAULTS.panelBackground,
      padding: overrides?.padding ?? CARD_DEFAULTS.padding,
    },
    overrides ?? {},
  )
}

/** @deprecated alias — figures use the same solid panel by default now */
export function figureStyle(overrides?: Partial<ItemStyle>): ItemStyle {
  return solidPanelStyle({ padding: CARD_DEFAULTS.padding, ...overrides })
}

export function equationStyle(overrides?: Partial<ItemStyle>): ItemStyle {
  return solidPanelStyle(overrides)
}

/** Whether the card should draw a solid panel (not transparent). */
export function hasBackgroundFill(
  item: Pick<CanvasItem, 'transparentBackground'>,
): boolean {
  // Only off when user explicitly disabled fill
  return item.transparentBackground !== true
}

/**
 * Normalize any card (new or loaded) to current app defaults.
 * Background fill is ON for all types unless transparentBackground === true.
 */
export function normalizeCanvasItem(item: CanvasItem): CanvasItem {
  const figure = isFigureLike(item)
  const transparent = item.transparentBackground === true

  const mergedStyle = {
    ...DEFAULT_ITEM_STYLE,
    ...item.style,
  }

  // Background fill is independent of border — border can stay on a transparent card
  const withBg: ItemStyle = transparent
    ? { ...mergedStyle, background: 'transparent' }
    : {
        ...mergedStyle,
        background:
          !mergedStyle.background ||
          mergedStyle.background === 'transparent'
            ? CARD_DEFAULTS.panelBackground
            : mergedStyle.background,
      }

  // Migrate legacy roomy padding (8/10/12) so content fills the card
  const rawPad = withBg.padding
  if (rawPad == null || LEGACY_CARD_PADS.has(rawPad)) {
    withBg.padding = CARD_DEFAULTS.padding
  }

  const style = withBorderStyle(withBg, {
    borderEnabled: withBg.borderEnabled !== false,
    borderWidth: withBg.borderWidth ?? CARD_DEFAULTS.borderWidth,
    borderStyle: withBg.borderStyle ?? CARD_DEFAULTS.borderStyle,
    borderColor: withBg.borderColor ?? CARD_DEFAULTS.borderColor,
  })

  return {
    ...item,
    contentFill: item.contentFill !== false,
    // Default ON — preserve aspect unless user opts into stretch free-transform
    keepAspectRatio: item.keepAspectRatio !== false,
    showTitle: item.showTitle !== false,
    titleAlign: item.titleAlign ?? CARD_DEFAULTS.titleAlign,
    transparentBackground: transparent,
    autoFit: figure ? false : item.autoFit === true,
    style,
  }
}

export function normalizeCanvasItems(items: CanvasItem[]): CanvasItem[] {
  return items.map(normalizeCanvasItem)
}

/** Shared fields when creating a new card from scratch. */
export function newCardBase(
  type: CanvasItemType,
  partial: Partial<CanvasItem> &
    Pick<CanvasItem, 'id' | 'x' | 'y' | 'width' | 'height' | 'zIndex'>,
): CanvasItem {
  const figure =
    type === 'figure' ||
    type === 'custom-image' ||
    (Boolean(partial.imageUrl) &&
      !partial.latex &&
      !partial.tableMarkdown &&
      !partial.mermaidSource)
  const processChart = type === 'process-chart' || Boolean(partial.mermaidSource)

  return normalizeCanvasItem({
    type,
    // Vector content fills the card (KaTeX fontSize / SVG / Mermaid fillContainer)
    contentFill:
      partial.contentFill !== undefined
        ? partial.contentFill
        : CARD_DEFAULTS.contentFill,
    keepAspectRatio:
      partial.keepAspectRatio !== undefined
        ? partial.keepAspectRatio
        : CARD_DEFAULTS.keepAspectRatio,
    showTitle: CARD_DEFAULTS.showTitle,
    titleAlign: CARD_DEFAULTS.titleAlign,
    // Process charts: fixed card size; diagram SVG scales inside the card
    autoFit: !figure && !processChart,
    style: solidPanelStyle({ padding: CARD_DEFAULTS.padding }),
    ...partial,
    // Solid panel for equations AND figures unless caller forces transparent
    transparentBackground: partial.transparentBackground === true,
  })
}
