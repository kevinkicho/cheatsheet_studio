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
    'type' | 'imageUrl' | 'latex' | 'tableMarkdown'
  >,
): boolean {
  return (
    item.type === 'figure' ||
    item.type === 'custom-image' ||
    (Boolean(item.imageUrl) && !item.latex && !item.tableMarkdown)
  )
}

/**
 * App-wide card defaults:
 * - Equations/tables: font-size fit (crisp KaTeX)
 * - Figures: FigureView (vector size) + same solid panel as other cards
 * - Background fill ON for all types (turn off via Properties)
 * - contentFill ON so content tracks card resize
 */
export const CARD_DEFAULTS = {
  contentFill: true as const,
  showTitle: true as const,
  titleAlign: 'left' as TitleAlign,
  /** Background fill on unless user opts out (transparentBackground: true). */
  backgroundFill: true as const,
  maxFillScale: 64,
  minFitScale: 0.08,
  equationFitMethod: 'fontSize' as const,
  panelBackground: 'rgba(30, 32, 40, 0.92)',
  borderEnabled: true as const,
  borderWidth: 1,
  borderStyle: 'solid' as BorderStroke,
  borderColor: DEFAULT_BORDER_COLOR,
}

export function solidPanelStyle(overrides?: Partial<ItemStyle>): ItemStyle {
  return withBorderStyle(
    {
      ...DEFAULT_ITEM_STYLE,
      background: CARD_DEFAULTS.panelBackground,
      padding: overrides?.padding ?? DEFAULT_ITEM_STYLE.padding ?? 12,
    },
    overrides ?? {},
  )
}

/** @deprecated alias — figures use the same solid panel by default now */
export function figureStyle(overrides?: Partial<ItemStyle>): ItemStyle {
  return solidPanelStyle({ padding: 8, ...overrides })
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

  const style = withBorderStyle(withBg, {
    borderEnabled: withBg.borderEnabled !== false,
    borderWidth: withBg.borderWidth ?? CARD_DEFAULTS.borderWidth,
    borderStyle: withBg.borderStyle ?? CARD_DEFAULTS.borderStyle,
    borderColor: withBg.borderColor ?? CARD_DEFAULTS.borderColor,
  })

  return {
    ...item,
    contentFill: item.contentFill !== false,
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
    (Boolean(partial.imageUrl) && !partial.latex && !partial.tableMarkdown)

  return normalizeCanvasItem({
    type,
    contentFill: CARD_DEFAULTS.contentFill,
    showTitle: CARD_DEFAULTS.showTitle,
    titleAlign: CARD_DEFAULTS.titleAlign,
    autoFit: !figure,
    style: figure
      ? solidPanelStyle({ padding: 8 })
      : solidPanelStyle(),
    ...partial,
    // Solid panel for equations AND figures unless caller forces transparent
    transparentBackground: partial.transparentBackground === true,
  })
}
