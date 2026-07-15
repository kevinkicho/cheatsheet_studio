import type { CanvasItem, LayoutPanel, PanelShape, SheetCanvas } from '@/types'
import { titleBandPx } from '@/types'
import {
  ORGANIZE_GRID,
  DENSITY_PRESETS,
  GRID_PACK_FILL_TARGET,
  MIN_READABLE_BODY_FONT,
  MIN_READABLE_TITLE_FONT,
  normalizePanelGroupLevels,
  normalizeLevelSubset,
  normalizeNgonLevels,
  type CheatsheetLayoutOptions,
  type GroupChrome,
  type PanelGroupLevel,
  type GroupSortOrder,
} from './constants'
import { getPackContentBox, snapToGridValue } from './contentBox'
import {
  folderAtGroupLevel,
  splitCheatSections,
  isHeadingCard,
  isProcessItem,
} from './folders'
import {
  minCardForFonts,
  minReadableCardSize,
  estimateIdealBlockSize,
  snapSizeToGrid,
  scaleCellRects,
  naturalTopicPack,
  computeGridAreaScale,
  pagesForIdealCells,
  type CellRect,
  type TopicSectionPlan,
} from './sizing'
import {
  placeTopicRegionsDense,
  placePlansHierarchical,
} from './shelf'
import {
  densifyPlacedGroups,
  ensureLeafTitleClearance,
  resolveLeafGroupCollisions,
  gravityCompactGroups,
  repackGroupsInParents,
  separateFolderClusters,
  resolveCardOverlaps,
  resolveSameLevelPanelCollisions,
  enforcePanelLayoutInvariants,
} from './densify'
import {
  resolveMultipageStraddles,
  insertPageGutters,
} from './multipage'
import {
  buildNestedHierarchyPanels,
  buildLayoutPanelsFromMembers,
  mergeAdjacentOutermostPanels,
  nestContainPanels,
  rebuildMultiChildOuters,
  clampPanelsToContentBox,
  clipNestedPanelRunsToParents,
} from './panels'

export function packCheatsheetLayout(
  items: CanvasItem[],
  canvas: SheetCanvas,
  options: CheatsheetLayoutOptions = {},
): {
  items: CanvasItem[]
  printPageCount: number
  /** Group frames when groupChrome includes panels. */
  layoutPanels: LayoutPanel[]
} {
  if (items.length === 0) {
    return {
      items,
      printPageCount: Math.max(1, canvas.printPageCount ?? 1),
      layoutPanels: [],
    }
  }

  const density = options.density ?? 'sm'
  const preset = DENSITY_PRESETS[density]
  // Always readable — density changes *size of cards*, not illegible microtype
  const titleFont = Math.max(9, preset.titleFontSize)
  const bodyFont = Math.max(12, preset.fontSize)
  const grid = Math.max(4, canvas.gridSpacing ?? ORGANIZE_GRID)
  // UI “Gap”: free-flow air between topic groups (and between panel *outers*).
  // Default 4px — always honored (never zeroed for hierarchical packs).
  const gapPx = Math.max(0, options.gap ?? 4)
  const fitPrint = options.fitPrint !== false
  const multiPage = options.multiPage !== false
  const groupByFolder = options.groupByFolder !== false
  const groupChrome: GroupChrome = options.groupChrome ?? 'labels'
  const useLabels = groupChrome === 'labels' || groupChrome === 'both'
  const usePanels = groupChrome === 'panels' || groupChrome === 'both'
  // UI panel pad (card edge → stroke). Default 4px.
  const panelPad = Math.max(0, Math.min(48, options.panelPadding ?? 4))
  const panelShape: PanelShape = options.panelShape ?? 'rect'
  /** N-gon = solid L chrome + exterior outline; rect = AABB frames */
  const usePolyomino = usePanels && panelShape === 'polygon'
  const groupSort: GroupSortOrder = options.groupSort ?? 'none'
  // Multi-select hierarchy: pack at deepest level; draw nested chrome for each
  const panelGroupLevels = normalizePanelGroupLevels(
    options.panelGroupLevels,
    options.panelGroupLevel,
  )
  const panelGroupLevel =
    panelGroupLevels[panelGroupLevels.length - 1] ?? (1 as PanelGroupLevel)
  // Reserve a title band so panel headers are not covered by cards
  const PANEL_TITLE_BAND_PX = usePanels ? 16 : 0
  // Multi-level hierarchy (L1+L2…): leaf title chips + exclusive L1 header
  const multiLevelHierarchy =
    usePanels &&
    panelGroupLevels.length > 1 &&
    (options.folders?.length ?? 0) > 0
  const dissolvePrintArea = options.dissolvePrintArea === true
  // Max pack space: single-page content box, or dissolved continuous multipage band
  const box = getPackContentBox(canvas, { dissolvePrintArea })

  // ── Chrome inset (screenshots 223714 / 223755) ─────────────────────────
  // Cards used to pack flush to the content box, then panel pad was collapsed
  // to 0 at the edge → blocks sitting ON the panel stroke. Reserve pad (and
  // nest inset for L1⊃L2) *inside* the printable box so chrome always fits.
  const nestChrome =
    usePanels && multiLevelHierarchy ? Math.max(2, panelPad) : 0
  const edgeChrome = usePanels ? panelPad : 0
  const packLeft = box.left + edgeChrome + nestChrome
  const packRight = box.left + box.width - edgeChrome - nestChrome
  const packWidth = Math.max(grid * 4, packRight - packLeft)
  const packTop = box.top // title cells reserved separately in hierarchical place

  const visible = items.filter((i) => !i.hidden)
  // Min outer card size from fonts (readable KaTeX/title) — density cannot go below this
  const minCard = minCardForFonts(bodyFont, titleFont)
  const minSnap = snapSizeToGrid(minCard.w, minCard.h, grid, packWidth, box.height)

  // Pack columns = chrome-inset band (not full content width)
  const pageCols = Math.max(1, Math.floor(packWidth / grid))
  const pageRows = Math.max(1, Math.floor(box.height / grid))
  const pageCells = pageCols * pageRows

  // Density: xs 0.8 → lg 1.4 on content-native ideals (clear size ladder)
  const dScale = preset.sizeScale

  // ── 1) Ideal pixel sizes → grid cells ───────────────────────────────────
  type IdealRow = {
    id: string
    item: CanvasItem
    cw: number
    ch: number
    minCw: number
    minCh: number
  }
  const ideals: IdealRow[] = visible.map((it) => {
    const ideal = estimateIdealBlockSize(it, box.width, titleFont)
    const proc = isProcessItem(it)
    const scale = proc ? preset.processSizeScale : dScale
    // Grow/shrink from ideal, but never below readable min box for this density
    const w = Math.max(minCard.w, Math.round(ideal.w * scale))
    const h = Math.max(
      isHeadingCard(it) ? Math.max(22, titleBandPx(titleFont) + 4) : minCard.h,
      Math.round(ideal.h * scale),
    )
    const snapped = snapSizeToGrid(
      Math.min(packWidth, w),
      Math.min(box.height, h),
      grid,
      packWidth,
      box.height,
    )
    const isHead = isHeadingCard(it)
    return {
      id: it.id,
      item: it,
      cw: Math.max(isHead ? 1 : minSnap.cw, snapped.cw),
      ch: Math.max(isHead ? 1 : minSnap.ch, snapped.ch),
      minCw: isHead
        ? Math.min(pageCols, Math.max(3, Math.ceil(100 / grid)))
        : minSnap.cw,
      minCh: isHead ? 1 : minSnap.ch,
    }
  })
  const idealById = new Map(ideals.map((r) => [r.id, r]))

  // Temporary items for section split (need isHeadingCard on CanvasItem shape)
  const forSplit: CanvasItem[] = ideals.map((r) => ({
    ...r.item,
    width: r.cw * grid,
    height: r.ch * grid,
  }))
  const rawSections = splitCheatSections(forSplit, {
    groupByFolder,
    folders: options.folders,
    groupSort,
    panelGroupLevel,
  })

  // ── 2) Per-topic ideal cell areas + shares ──────────────────────────────
  const headingChIdeal = Math.max(1, Math.ceil((titleBandPx(titleFont) + 6) / grid))
  let totalBodyCells = 0
  const sectionMeta: Array<{
    index: number
    heading?: CanvasItem
    body: IdealRow[]
    idealCells: number
    headingCh: number
    groupFolderId: string | null
  }> = []

  const folderNameMap = new Map(
    (options.folders ?? []).map((f) => [f.id, f.name ?? f.id]),
  )

  rawSections.forEach((sec, index) => {
    // Only the first heading is the section banner. Other heading-like cards
    // (nested "1.1 …" when packing at L1) stay in the body so they pack with
    // the group instead of vanishing / floating at orphan coords.
    let heading = sec.find(isHeadingCard)
    const bodyItems = sec.filter((i) => i.id !== heading?.id)
    const body = bodyItems
      .map((i) => idealById.get(i.id))
      .filter((x): x is IdealRow => Boolean(x))
    const rawFolder =
      bodyItems.find((b) => b.folderId)?.folderId ??
      heading?.folderId ??
      null
    const groupFolderId = folderAtGroupLevel(
      rawFolder,
      options.folders ?? [],
      panelGroupLevel,
    )
    // Topic labels with folder groups often have no heading cards — synthesize
    // a banner from the folder name so labels ≠ none.
    if (useLabels && !heading && groupFolderId) {
      const fname = folderNameMap.get(groupFolderId) ?? groupFolderId
      const safe = fname.replace(/[{}\\]/g, '')
      heading = {
        id: `__label_${groupFolderId}_${index}`,
        type: 'equation',
        title: fname,
        latex: `\\textbf{\\text{${safe}}}`,
        showTitle: false,
        x: 0,
        y: 0,
        width: 240,
        height: Math.max(22, titleBandPx(titleFont) + 4),
        zIndex: 0,
        autoFit: false,
        folderId: groupFolderId,
        style: {
          fontSize: bodyFont,
          titleFontSize: titleFont,
        },
      } as CanvasItem
    }
    const bodyCells = body.reduce((s, b) => s + b.cw * b.ch, 0)
    const hCh = heading ? headingChIdeal : 0
    // Heading costs full-width strip for area budgeting
    const headingCells = heading ? pageCols * hCh : 0
    const idealCells = bodyCells + headingCells
    totalBodyCells += idealCells
    sectionMeta.push({
      index,
      heading,
      body,
      idealCells: Math.max(1, idealCells),
      headingCh: hCh,
      groupFolderId,
    })
  })
  if (totalBodyCells < 1) totalBodyCells = 1

  // ── 3) Pages + global area scale ────────────────────────────────────────
  // Prefer **more pages** over crushing cards. Old minScale 0.52 made “Small”
  // exports unreadable (KaTeX clipped in micro cards).
  const minScale = multiPage
    ? 0.94 // almost never shrink multipage packs
    : density === 'xs'
      ? 0.82
      : density === 'sm'
        ? 0.88
        : density === 'md'
          ? 0.92
          : 0.95
  let pages = multiPage
    ? pagesForIdealCells(
        totalBodyCells,
        pageCells,
        GRID_PACK_FILL_TARGET,
        minScale,
        20,
      )
    : 1
  if (!multiPage) pages = 1

  let areaScale = computeGridAreaScale(
    totalBodyCells,
    pageCells,
    pages,
    GRID_PACK_FILL_TARGET,
    minScale,
  )
  if (multiPage) {
    while (
      pages < 20 &&
      totalBodyCells * areaScale * areaScale >
        pages * pageCells * GRID_PACK_FILL_TARGET * 1.02
    ) {
      pages++
      areaScale = computeGridAreaScale(
        totalBodyCells,
        pageCells,
        pages,
        GRID_PACK_FILL_TARGET,
        minScale,
      )
    }
    // Hard floor: never squash multipage content below this
    areaScale = Math.max(0.94, areaScale)
  }

  // ── 4) Scale body cells; natural tight topic blocks (no forced columns) ─
  // Placement uses content size only — panel pad is visual, not slot inflation.
  const plans: TopicSectionPlan[] = sectionMeta.map((meta) => {
    const rawRects: CellRect[] = meta.body.map((b) => ({
      id: b.id,
      cw: b.cw,
      ch: b.ch,
    }))
    const scaled = scaleCellRects(
      rawRects,
      areaScale,
      pageCols,
      Math.max(1, minSnap.cw),
      Math.max(1, minSnap.ch),
    )
    const bodyRects = scaled.map((r) => {
      const src = meta.body.find((b) => b.id === r.id)!
      return {
        id: r.id,
        cw: Math.max(src.minCw, Math.min(pageCols, r.cw)),
        ch: Math.max(src.minCh, r.ch),
      }
    })

    const natural = naturalTopicPack(bodyRects, pageCols)
    // Labels+panels (both) + nested hierarchy: panel title chips are the
    // labels — placing full heading banners *and* panelTitleCh + outerTitle
    // triple-stacked and left huge voids / overlapping chrome.
    // both + multiLevel → panels-only placement (hide banners); flat both keeps banners.
    const bothNested = useLabels && usePanels && multiLevelHierarchy
    const placeHeadingCh =
      useLabels && meta.heading && !bothNested ? meta.headingCh : 0
    // Title chip band inside the region (1 cell max — avoid bloating every leaf).
    const panelTitleCh =
      usePanels && (meta.heading || meta.body.length)
        ? multiLevelHierarchy
          ? bothNested
            ? 0
            : 1
          : PANEL_TITLE_BAND_PX > 0
            ? 1
            : 0
        : 0

    // Dense natural shelf — region = content only (+ thin title strip).
    const contentCw = Math.max(1, natural.contentCw)
    const contentCh = Math.max(1, natural.contentCh)
    const regionCw = Math.min(pageCols, contentCw)
    const regionCh = Math.max(1, placeHeadingCh + panelTitleCh + contentCh)

    return {
      index: meta.index,
      heading: meta.heading,
      body: meta.body.map((b) => b.item),
      groupFolderId: meta.groupFolderId,
      idealCells: meta.idealCells,
      areaShare: meta.idealCells / totalBodyCells,
      regionCw,
      regionCh,
      contentCw,
      contentCh,
      padCells: 0,
      bodyRects: natural.rects,
      bodyPos: natural.pos,
      headingCh: placeHeadingCh,
      panelTitleCh,
    }
  })

  // ── 5–6) Place cards: continuous topic blocks, free-flow only ──────────
  // Always maxrects + gravity (never row/column shelf). groupSort only
  // reorders the *input list*; height-first densifies when sort is none.
  // panelPad (px) → inter-panel gap in grid cells (0 when pad < half cell).
  const placed: CanvasItem[] = []
  let z = 1
  const styleBase = {
    fontSize: Math.max(12, Math.round(bodyFont * Math.sqrt(Math.max(0.9, areaScale)))),
    titleFontSize: Math.max(
      9,
      Math.round(titleFont * Math.sqrt(Math.max(0.9, areaScale))),
    ),
  }

  const nameOrdered = groupSort === 'name-asc' || groupSort === 'name-desc'
  const shallowLevel = panelGroupLevels[0] ?? 1
  const deepLevel =
    panelGroupLevels[panelGroupLevels.length - 1] ?? shallowLevel
  // Nested levels (e.g. L1+L2): pack leaf groups inside each outer parent
  // first, then free-flow parents — prevents L1 frames stacking across the page.
  const useHierarchicalPlace =
    usePanels && deepLevel > shallowLevel && (options.folders?.length ?? 0) > 0

  // ── Gap + panel pad (tight free-flow / tetris stacking) ─────────────────
  // gap          → air between group content boxes (user slider)
  // panelPadding → chrome pad only (card edge → stroke), NOT a second free-flow gap
  //
  // Keep inter-group clearance = gap + 2×pad when those levels stroke (so frames
  // don't collide). Do NOT inflate by title bands — titles live inside chrome.
  const borderLevelsForGap = normalizeLevelSubset(
    options.panelBorderLevels,
    panelGroupLevels,
    /* defaultOuterOnly */ true,
  )
  const leafLevelsStroke = borderLevelsForGap.some((L) => L > shallowLevel)
  const outerLevelsStroke = borderLevelsForGap.includes(shallowLevel)

  // Nest inset: only the user pad (0 when pad is 0). Keep ≤1 cell so L1/L2
  // borders don't stack; pad itself is visual chrome, not a second free-flow gap.
  const nestInsetPx = useHierarchicalPlace ? panelPad : 0

  /**
   * px → free-flow gap cells.
   * Sub-cell user gaps pack at 0 (chrome pad is visual). When a level *strokes*,
   * reserve 1 cell so sibling frames with pad don't land on top of each other
   * (that forced leaf collision pushes which then interleaved L1 topics).
   */
  const pxToCells = (px: number) => {
    if (px <= 0) return 0
    if (px < grid / 2) return 0
    return Math.min(2, Math.max(1, Math.ceil(px / grid)))
  }

  // n-gon = hard tetris (minimal free-flow gap); rect = rectangular tetris
  // with user gap. Inter-topic clearance must fit: bottom pad + next title
  // band + top pad + user gap — otherwise the next L1 title strip paints over
  // the previous topic's cards (polygon multi-topic overlap regression).
  const hardTetris = usePolyomino
  const L1_TITLE_CLEAR_PX = 26
  const interTopicChromePx = usePanels
    ? panelPad * 2 +
      (outerLevelsStroke ? L1_TITLE_CLEAR_PX : 0) +
      Math.max(0, gapPx)
    : Math.max(0, gapPx)
  const chromeClearCells = usePanels
    ? Math.max(1, Math.ceil(interTopicChromePx / grid))
    : 0
  const leafGapCells = hardTetris
    ? Math.max(
        0,
        leafLevelsStroke && panelPad > 0
          ? Math.max(1, Math.ceil((panelPad * 2 + Math.max(0, gapPx)) / grid))
          : 0,
      )
    : Math.max(
        pxToCells(gapPx),
        usePanels && leafLevelsStroke && panelPad > 0
          ? Math.max(1, Math.ceil((panelPad * 2 + Math.max(0, gapPx)) / grid))
          : 0,
      )
  const outerGapCells = hardTetris
    ? chromeClearCells
    : Math.max(pxToCells(gapPx), chromeClearCells)

  // L1 exclusive chip + nested L2 chip under it (~24+16) so cards never sit
  // under the visible header stack (LayoutPanelsLayer places L2 under L1+24).
  const outerTitleCells = useHierarchicalPlace
    ? Math.max(
        2,
        Math.ceil(
          (28 +
            (leafLevelsStroke ? 18 : 0) +
            panelPad) /
            grid,
        ),
      )
    : 0
  const nestInsetCells =
    nestInsetPx > 0 ? Math.min(1, Math.ceil(nestInsetPx / grid)) : 0
  // Gravity floor: keep card tops below reserved L1 title chrome.
  const gravityContentTop =
    multiLevelHierarchy && outerLevelsStroke
      ? packTop + Math.max(0, outerTitleCells * grid)
      : packTop

  const placeOpts = {
    sortByHeight: !nameOrdered,
    readingFlow: nameOrdered,
  }
  const regionPos = useHierarchicalPlace
    ? placePlansHierarchical(
        plans.map((p) => ({
          index: p.index,
          cw: p.regionCw,
          ch: p.regionCh,
          leafFolderId:
            p.groupFolderId ??
            p.body.find((b) => b.folderId)?.folderId ??
            p.heading?.folderId ??
            null,
        })),
        options.folders ?? [],
        shallowLevel,
        pageCols,
        leafGapCells,
        {
          ...placeOpts,
          outerTitleCells,
          outerGapCells,
          nestInsetCells,
        },
      )
    : placeTopicRegionsDense(
        plans.map((p) => ({
          index: p.index,
          cw: p.regionCw,
          ch: p.regionCh,
        })),
        pageCols,
        outerGapCells,
        placeOpts,
      )

  for (const plan of plans) {
    const origin = regionPos.get(plan.index) ?? { c: 0, r: 0 }
    let localR = 0

    // Panels-only, or both+nested: hide section banners (panel chips = labels).
    // Labels-only or both+flat: place full-width topic banners.
    const bothNestedPlace = useLabels && usePanels && multiLevelHierarchy
    if ((usePanels && !useLabels) || bothNestedPlace) {
      if (plan.heading) {
        placed.push({
          ...plan.heading,
          hidden: true,
          autoFit: false,
        })
      }
    } else if (useLabels && plan.heading && plan.headingCh > 0) {
      // Topic labels (and flat labels+panels): banner row above section cards
      const hCh = Math.max(1, plan.headingCh)
      const isProc = isProcessItem(plan.heading)
      const isFig =
        Boolean(plan.heading.imageUrl) || plan.heading.type === 'figure'
      // Prefer region width so the label reads as a topic band, not a micro chip
      const bannerW = Math.max(1, plan.regionCw || plan.contentCw) * grid
      placed.push({
        ...plan.heading,
        hidden: false,
        x: Math.round(packLeft + origin.c * grid),
        y: Math.round(packTop + (origin.r + localR) * grid),
        width: Math.round(Math.min(packWidth, Math.max(bannerW, grid * 4))),
        height: Math.round(hCh * grid),
        zIndex: z++,
        style: { ...plan.heading.style, ...styleBase },
        autoFit: false,
        contentFill: isProc || isFig,
      })
      localR += hCh
    }

    if (plan.panelTitleCh > 0) {
      localR += plan.panelTitleCh
    }

    if (plan.bodyRects.length === 0) continue

    for (const it of plan.body) {
      const rect = plan.bodyRects.find((r) => r.id === it.id)
      const p = plan.bodyPos.get(it.id) ?? { c: 0, r: 0 }
      if (!rect) continue
      const isProc = isProcessItem(it)
      const isFig = Boolean(it.imageUrl) || it.type === 'figure'
      // Quieter card chrome when panels are on — outer perimeter carries structure
      const quietBorder = usePanels
        ? { borderEnabled: false as const, borderWidth: 0, border: 'none' }
        : {}
      placed.push({
        ...it,
        hidden: false,
        x: Math.round(packLeft + (origin.c + p.c) * grid),
        y: Math.round(packTop + (origin.r + localR + p.r) * grid),
        width: Math.round(rect.cw * grid),
        height: Math.round(rect.ch * grid),
        zIndex: z++,
        style: { ...it.style, ...styleBase, ...quietBorder },
        autoFit: false,
        contentFill: isProc || isFig,
      })
    }
  }

  let result = placed

  // Single-page fit-print: final uniform shrink if still past content box
  const maxBottom = result.reduce(
    (m, it) => Math.max(m, it.y + it.height),
    box.top,
  )
  const contentBottom = box.top + box.height
  if (fitPrint && !multiPage && maxBottom > contentBottom + 4) {
    const overflow = maxBottom - box.top
    const avail = box.height
    const shrink = Math.max(0.55, Math.min(1, (avail - gapPx) / overflow))
    if (shrink < 0.98) {
      const minSz = minReadableCardSize(titleFont)
      result = result.map((it) => {
        const isHead = isHeadingCard(it)
        return {
          ...it,
          x: Math.round(box.left + (it.x - box.left) * shrink),
          y: Math.round(box.top + (it.y - box.top) * shrink),
          width: Math.max(isHead ? 80 : minSz.w, Math.round(it.width * shrink)),
          height: Math.max(isHead ? 20 : minSz.h, Math.round(it.height * shrink)),
          style: {
            ...it.style,
            fontSize: Math.max(
              MIN_READABLE_BODY_FONT,
              Math.round((it.style?.fontSize ?? bodyFont) * Math.sqrt(shrink)),
            ),
            titleFontSize: Math.max(
              MIN_READABLE_TITLE_FONT,
              Math.round(
                (it.style?.titleFontSize ?? titleFont) * Math.sqrt(shrink),
              ),
            ),
          },
        }
      })
    }
  }

  const bottomFinal = result.reduce(
    (m, it) => Math.max(m, it.y + it.height),
    box.top,
  )
  const pageStep = Math.max(1, box.pageHeight)
  let pageCount = multiPage
    ? Math.min(20, Math.max(1, Math.ceil(bottomFinal / pageStep)))
    : 1
  // Prefer planned page count when continuous y is a bit short of last page
  if (multiPage) {
    pageCount = Math.min(20, Math.max(pageCount, pages))
  }

  // Snap positions to grid and clamp into the *card pack band* (chrome inset).
  // Panels may paint to the full content box; cards stay inset so pad never
  // collapses to zero (screenshot 223755: blocks on panel border).
  const contentRight = packRight
  result = result.map((it) => {
    const snapped = snapSizeToGrid(
      it.width,
      it.height,
      grid,
      packWidth,
      box.height,
    )
    let w = Math.max(grid, Math.min(packWidth, snapped.w))
    let h = Math.max(grid, snapped.h)
    let x = snapToGridValue(it.x, grid, packLeft)
    let y = snapToGridValue(it.y, grid, packTop)
    if (x < packLeft) x = packLeft
    if (x + w > contentRight) {
      x = Math.max(packLeft, contentRight - w)
      x = snapToGridValue(x, grid, packLeft)
      if (x + w > contentRight) {
        w = Math.max(grid, contentRight - x)
      }
    }
    return {
      ...it,
      x,
      y,
      width: w,
      height: h,
    }
  })

  // Overlap guard: if any two cards share the same origin, nudge (should be rare)
  const seen = new Set<string>()
  result = result.map((it) => {
    let key = `${it.x},${it.y}`
    if (!seen.has(key)) {
      seen.add(key)
      return it
    }
    let y = it.y + grid
    key = `${it.x},${y}`
    let guard = 0
    while (seen.has(key) && guard < 200) {
      y += grid
      key = `${it.x},${y}`
      guard++
    }
    seen.add(key)
    return { ...it, y }
  })

  // Close voids per leaf group (single pass — second pass was costly).
  if (usePanels && (options.folders?.length ?? 0) > 0) {
    result = densifyPlacedGroups(result, options.folders ?? [], deepLevel, {
      grid,
      contentLeft: packLeft,
      contentTop: packTop,
      contentRight: packRight,
      pageCols,
      gapCells: 0,
    })
  }

  // Thin title-chip band only (don't push groups by large bands)
  if (usePanels && multiLevelHierarchy) {
    result = ensureLeafTitleClearance(
      result,
      options.folders ?? [],
      deepLevel,
      Math.max(18, PANEL_TITLE_BAND_PX),
      grid,
    )
  }

  // Residual same-folder card overlaps
  result = resolveCardOverlaps(result, {
    grid,
    contentRight: packRight,
  })

  // Only separate true leaf AABB overlaps (minGap = user gap only)
  if (usePanels && leafLevelsStroke && (options.folders?.length ?? 0) > 0) {
    result = resolveLeafGroupCollisions(
      result,
      options.folders ?? [],
      deepLevel,
      {
        grid,
        minGapPx: Math.max(0, gapPx),
        parentLevel: shallowLevel,
      },
    )
  }

  // Authoritative hierarchical tetris: re-pack every L2/L3 block inside its
  // L1 into a tight rectangle, then stack L1 topics. This is what kills the
  // empty corners / snaking corridors / huge inter-topic voids users kept
  // reporting (screenshots 202039, 214119, 214206, 214641, 214716).
  //
  // parentGap is ONLY inter-frame air + pad — L1 title is already reserved
  // via titleCells *inside* each parent (do not double-count title here).
  if (usePanels && multiLevelHierarchy && (options.folders?.length ?? 0) > 0) {
    const interParentGapPx = Math.max(
      gapPx,
      outerLevelsStroke ? panelPad * 2 + Math.max(0, gapPx) : gapPx,
    )
    const innerLeafGapCells = hardTetris
      ? chromeClearCells
      : Math.max(0, leafLevelsStroke && panelPad > 0 ? 1 : 0)
    result = repackGroupsInParents(
      result,
      options.folders ?? [],
      deepLevel,
      shallowLevel,
      {
        grid,
        contentLeft: packLeft,
        contentTop: packTop,
        contentRight: packRight,
        gapCells: innerLeafGapCells,
        parentGapPx: interParentGapPx,
        titleCells: outerTitleCells,
      },
    )
  } else if (usePanels && (options.folders?.length ?? 0) > 0) {
    // Single-level panels: gravity, then separate so title bands don't invade
    result = gravityCompactGroups(result, options.folders ?? [], deepLevel, {
      grid,
      gapPx: Math.max(interTopicChromePx, panelPad * 2 + Math.max(0, gapPx)),
      contentLeft: packLeft,
      contentTop: packTop,
      contentRight: packRight,
    })
  }

  // Stack parent (or single-level) clusters so title+pad never paint over the
  // previous topic's cards.
  if (usePanels && (options.folders?.length ?? 0) > 0) {
    result = separateFolderClusters(
      result,
      options.folders ?? [],
      shallowLevel,
      {
        grid,
        minGapPx: interTopicChromePx,
      },
    )
  }

  // Final hard clamp of cards into the chrome-inset pack band.
  {
    result = result.map((it) => {
      if (it.hidden) return it
      let x = it.x
      let y = it.y
      let w = it.width
      let h = it.height
      if (x < packLeft) {
        w -= packLeft - x
        x = packLeft
      }
      if (x + w > packRight) {
        x = Math.max(packLeft, packRight - w)
        if (x + w > packRight) w = Math.max(grid, packRight - x)
      }
      if (y < packTop) y = packTop
      return {
        ...it,
        x: Math.round(x),
        y: Math.round(y),
        width: Math.max(grid, Math.round(w)),
        height: Math.max(grid, Math.round(h)),
      }
    })
  }

  // Multipage seams:
  // - Dissolved: one continuous pack band (no inter-page gutters) — max space.
  // - Normal: continuous bands → insert gutters → board cleanup.
  if (multiPage && box.dissolved) {
    // Content already packs into dissolved height; only keep items in band
    result = resolveMultipageStraddles(result, {
      pageHeight: box.height,
      marginTop: box.top,
      contentHeight: box.height,
      grid,
      mode: 'continuous',
    })
  } else if (multiPage) {
    result = resolveMultipageStraddles(result, {
      pageHeight: box.height,
      marginTop: box.top,
      contentHeight: box.height,
      grid,
      mode: 'continuous',
    })
    result = insertPageGutters(result, {
      pageHeight: box.pageHeight,
      marginTop: box.margins.top,
      contentHeight: box.height,
    })
    result = resolveMultipageStraddles(result, {
      pageHeight: box.pageHeight,
      marginTop: box.margins.top,
      contentHeight: box.height,
      grid,
      mode: 'board',
    })
  }

  const byId = new Map(result.map((p) => [p.id, p]))
  const headingIds = new Set(
    plans.map((p) => p.heading?.id).filter((id): id is string => Boolean(id)),
  )
  const folderName = new Map(
    (options.folders ?? []).map((f) => [f.id, f.name ?? f.id]),
  )

  const bothNestedMerge = useLabels && usePanels && multiLevelHierarchy
  const mergedBase = items.map((old) => {
    // None / panels-only / both+nested: hide heading banners (panel chips).
    // Labels / both+flat: keep banners (placed above as full-width rows).
    if ((!useLabels || bothNestedMerge) && isHeadingCard(old)) {
      return { ...old, hidden: true, autoFit: false }
    }
    if (old.hidden && !byId.has(old.id)) return old
    const n = byId.get(old.id)
    if (!n) {
      // Unplaced non-heading cards keep prior geometry; unplaced headings under
      // labels mode that missed placement still hide (avoid orphan floaters).
      if (useLabels && isHeadingCard(old) && !headingIds.has(old.id)) {
        return { ...old, hidden: true, autoFit: false }
      }
      return { ...old, autoFit: false }
    }
    return {
      ...n,
      contentFitKey: old.contentFitKey,
    }
  })
  // Synthetic topic-label banners (folder groups without heading cards)
  const syntheticLabels = result.filter((r) => r.id.startsWith('__label_'))
  // Drop prior synthetic labels from earlier packs so re-layout stays clean
  const withoutOldSynth = mergedBase.filter((i) => !i.id.startsWith('__label_'))
  const merged = [...withoutOldSynth, ...syntheticLabels]

  // ── 7) Layout panels — nested hierarchy + rect AABB or n-gon card runs ─
  let layoutPanels: LayoutPanel[] = []
  if (usePanels) {
    const folders = options.folders ?? []
    const borderLevels = normalizeLevelSubset(
      options.panelBorderLevels,
      panelGroupLevels,
      /* defaultOuterOnly */ true,
    )
    const ngonLevels =
      panelShape === 'polygon'
        ? normalizeNgonLevels(
            options.panelNgonLevels,
            borderLevels,
            panelGroupLevels,
          )
        : []
    // Prefer hierarchy builder (supports multi-select nested L1⊃L2⊃L3)
    layoutPanels = buildNestedHierarchyPanels({
      placed: result,
      folders,
      levels: panelGroupLevels,
      panelPad,
      panelShape: usePolyomino ? 'polygon' : 'rect',
      borderLevels,
      ngonLevels,
      folderName,
      titleBandPx: PANEL_TITLE_BAND_PX,
      grid,
      contentLeft: box.left,
      contentRight: box.left + box.width,
      contentTop: box.top,
    })
    // Fallback when no folderIds on cards (heading-only splits)
    if (layoutPanels.length === 0) {
      layoutPanels = buildLayoutPanelsFromMembers({
        plans,
        placed: result,
        panelPad,
        panelShape: usePolyomino ? 'polygon' : 'rect',
        folderName,
        useLabels,
        titleBandPx: PANEL_TITLE_BAND_PX,
        grid,
      })
    }
    // Adjacent outermost (L1) panels merge strokes → one consecutive outline
    if (layoutPanels.length > 1) {
      layoutPanels = mergeAdjacentOutermostPanels(layoutPanels, {
        grid,
        panelPad,
      })
    }
    // Same-level sibling frames must not paint over each other (export SVG
    // double-borders). Rebuild chrome with reduced pad — nested L1⊃L2 is ok.
    layoutPanels = resolveSameLevelPanelCollisions(layoutPanels, {
      grid,
      panelPad,
      placed: result,
      contentLeft: box.left,
      contentRight: box.left + box.width,
      multiLevel: multiLevelHierarchy,
      outerLevel: shallowLevel,
    })
    // Guarantee every panel covers its cards (never shrink under members)
    layoutPanels = nestContainPanels(layoutPanels, {
      insetPx: multiLevelHierarchy ? Math.max(2, panelPad) : 0,
      contentLeft: box.left,
      contentRight: box.left + box.width,
      contentTop: box.top,
      placed: result,
      panelPad,
    })
    // Only rebuild multi-child outers as stepped chrome when L1 itself is n-gon.
    // Forcing stepped L1 for all multi-child produced snaking “weird boxes”
    // (screenshot 214119) when n-gon was only selected for L2/L3.
    const outerIsNgon =
      panelShape === 'polygon' &&
      normalizeNgonLevels(
        options.panelNgonLevels,
        borderLevels,
        panelGroupLevels,
      ).includes(shallowLevel)
    if (multiLevelHierarchy && outerIsNgon) {
      layoutPanels = rebuildMultiChildOuters(layoutPanels, {
        panelPad,
        titleBandPx: PANEL_TITLE_BAND_PX,
        contentLeft: box.left,
        contentRight: box.left + box.width,
        contentTop: box.top,
        grid,
      })
    }
    // Clip L2/L3 n-gon runs into L1 so stepped chrome cannot paint outside
    // the parent frame (screenshot 235248).
    layoutPanels = clipNestedPanelRunsToParents(layoutPanels)
    // Hard invariants: same-level panels never overlap; title bands never
    // covered by cards or nested panel headers.
    {
      const fixed = enforcePanelLayoutInvariants(merged, layoutPanels, {
        grid,
        panelPad,
        contentLeft: box.left,
        contentRight: box.left + box.width,
        contentTop: box.top,
        minGapPx: Math.max(2, gapPx),
      })
      // Replace card positions in merged (panel members only move)
      const movedById = new Map(fixed.items.map((i) => [i.id, i]))
      for (let i = 0; i < merged.length; i++) {
        const n = movedById.get(merged[i]!.id)
        if (n) merged[i] = n
      }
      layoutPanels = fixed.panels
    }
    // Final hard clamp LAST — rebuild outlines from clamped runs so n-gon
    // path vertices never sit past the content box (outline x=772 > 768).
    layoutPanels = clampPanelsToContentBox(layoutPanels, {
      left: box.left,
      right: box.left + box.width,
      top: box.top,
    })
  }

  const bottom2 = merged.reduce(
    (m, it) => (it.hidden ? m : Math.max(m, it.y + it.height)),
    box.top,
  )
  if (multiPage) {
    // Dissolved pack is continuous; page frames still tile by pageHeight
    pageCount = Math.min(
      20,
      Math.max(1, Math.ceil((bottom2 - box.top + box.margins.top) / pageStep)),
    )
  }

  return { items: merged, printPageCount: pageCount, layoutPanels }
}
