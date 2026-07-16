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
  type CheatsheetLayoutOptions,
  type GroupChrome,
  normalizeGroupChrome,
  resolveLayoutGaps,
  gapPxToCells,
  type PanelGroupLevel,
  type GroupSortOrder,
} from './constants'
import {
  getPackContentBox,
  resolvePackedPrintPageCount,
  snapToGridValue,
} from './contentBox'
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
import { refinePlacedCards } from './packCheatsheet/postPlace'
import { finalizeLayoutPanels } from './packCheatsheet/finalizePanels'

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
  // Three gap knobs (rect + n-gon both honor these):
  //   l1PanelGap — between L1 outer frames
  //   l2PanelGap — between L2 sibling frames inside an L1
  //   blockGap   — between cards inside a leaf pack
  const {
    l1PanelGap: l1GapPx,
    l2PanelGap: l2GapPx,
    blockGap: blockGapPx,
  } = resolveLayoutGaps(options)
  // Legacy alias used by gravity / single-level paths
  const gapPx = l1GapPx
  // Card free-flow gap cells (any blockGap > 0 → ≥1 cell on the organize grid)
  const blockGapCells = gapPxToCells(blockGapPx, grid)
  const fitPrint = options.fitPrint !== false
  const multiPage = options.multiPage !== false
  const groupByFolder = options.groupByFolder !== false
  const groupChrome: GroupChrome = normalizeGroupChrome(options.groupChrome)
  const useLabels = groupChrome === 'labels'
  const usePanels = groupChrome === 'panels'
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
  // Prefer readable cards, but do **not** invent empty page frames.
  // minScale 0.94 + plannedPages floor previously forced a blank second page
  // whenever ideal-cell area was slightly over one page (even when densify fit).
  const userPages = Math.max(1, canvas.printPageCount ?? 1)
  const minScale = multiPage
    ? 0.88 // modest shrink before adding pages (was 0.94)
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

  // Prefer the user’s current page budget when it stays readable — ideal-cell
  // budgeting alone often over-plans pages. Final frame count still comes from
  // actual content extent in resolvePackedPrintPageCount.
  if (multiPage && userPages < pages) {
    const scaleOnUser = computeGridAreaScale(
      totalBodyCells,
      pageCells,
      userPages,
      GRID_PACK_FILL_TARGET,
      0.01,
    )
    if (scaleOnUser >= minScale) {
      pages = userPages
    }
  }

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
    areaScale = Math.max(minScale, areaScale)
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

    const natural = naturalTopicPack(bodyRects, pageCols, {
      gapCells: blockGapCells,
    })
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

  // groupSort:
  // - name-asc/desc: sort sections by name, lock insertion order (multiOrder off,
  //   preserveOrder) through hierarchical leaf pack + post re-pack. Dense
  //   top-left place with left-only compact — not diagonal readingFlow voids.
  // - none: multi-order densest + full gravity (may reorder freely).
  const placeOpts = {
    sortByHeight: !nameOrdered,
    readingFlow: false,
    multiOrder: !nameOrdered,
    preserveOrder: nameOrdered,
  }

  // ── Gaps (user knobs) + chrome pad + title floor ───────────────────────
  // l1PanelGap  → air between L1 outer frames (content clearance + 2×pad)
  // l2PanelGap  → air between L2 sibling frames inside an L1
  // blockGap    → air between cards inside a leaf
  // panelPadding → inset cards→stroke only (not a free-flow gap by itself)
  // Title bands live *inside* each panel (titleCells / exclusiveTitleBand);
  // do not double-count L1 title into L2 leaf gaps.
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

  // L1 title strip is reserved via titleCells *inside* each parent.
  const L1_TITLE_CLEAR_PX = 26
  // L2 local chip ~16px — only between *stacked* frames (title is on top of
  // each panel). Must NOT inflate horizontal content clear or side-by-side
  // stroke gaps stay ~userGap+title (e.g. 2+16=18) while vertical is correct.
  const L2_TITLE_PACK_PX = leafLevelsStroke ? 16 : 0

  // Content-to-content clearance so stroked frames sit ~userGap apart.
  // Horizontal: userGap + 2×pad (no title — chips are not on the side).
  // Vertical:   userGap + 2×pad + title (stacked chrome includes header).
  const l1ContentClearPx = usePanels
    ? Math.max(0, l1GapPx) + (outerLevelsStroke ? panelPad * 2 : 0)
    : Math.max(0, l1GapPx)
  const l2ContentClearH =
    usePanels && leafLevelsStroke
      ? Math.max(0, l2GapPx) + panelPad * 2
      : Math.max(0, l2GapPx)
  const l2ContentClearV =
    usePanels && leafLevelsStroke
      ? Math.max(0, l2GapPx) + panelPad * 2 + L2_TITLE_PACK_PX
      : Math.max(0, l2GapPx)
  // Legacy single-value (vertical) for callers that only pass one minGap.
  const l2ContentClearPx = l2ContentClearV

  // Free-flow cells use *horizontal* clear (smaller) so we never reserve a
  // full title gutter between side-by-side leaves. Pixel post-pass opens the
  // exact H/V content clear. Do NOT force min-1 cell — that locked H stroke
  // at ~18px for 2px user gap on a 24px grid.
  const leafGapCells = gapPxToCells(l2ContentClearH, grid)
  const outerGapCells = gapPxToCells(l1ContentClearPx, grid)

  // Pixel post-passes (separateFolderClusters / resolveLeafGroupCollisions)
  // Flat L1 vertical stack may need title; horizontal uses pad-only clear.
  const interTopicChromePx = usePanels
    ? l1ContentClearPx +
      (outerLevelsStroke && !useHierarchicalPlace ? L1_TITLE_CLEAR_PX : 0)
    : l1GapPx

  // L1 exclusive band: chip + nested top-row L2 chip room when multi-level
  // (~42). Each L2 also reserves its own local titleBand in panel chrome.
  const outerTitleCells = useHierarchicalPlace
    ? Math.max(
        1,
        Math.ceil(
          ((leafLevelsStroke ? 42 : 28) + panelPad) / grid,
        ),
      )
    : 0
  const nestInsetCells =
    nestInsetPx > 0 ? Math.min(1, Math.ceil(nestInsetPx / grid)) : 0
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
      let pw = Math.round(rect.cw * grid)
      let ph = Math.round(rect.ch * grid)
      // Never crush process/mindmap cards below a readable free-form footprint
      if (isProc) {
        pw = Math.max(pw, 280)
        ph = Math.max(ph, 200)
        // Honor existing processFlow viewBox when larger (user-resized diagram)
        const pf = it.processFlow as
          | { width?: number; height?: number }
          | undefined
        if (pf?.width && pf.width > pw) pw = Math.min(packWidth, Math.round(pf.width * 0.9))
        if (pf?.height && pf.height > ph) ph = Math.max(ph, Math.round(pf.height * 0.85))
      }
      placed.push({
        ...it,
        hidden: false,
        x: Math.round(packLeft + (origin.c + p.c) * grid),
        y: Math.round(packTop + (origin.r + localR + p.r) * grid),
        width: pw,
        height: ph,
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
  const rightFinal = result.reduce(
    (m, it) => (it.hidden ? m : Math.max(m, it.x + it.width)),
    box.left,
  )
  // Early estimate (refined after finalize with full extent + layout-aware rules).
  // Content extent only — do not floor with ideal-cell `pages` (empty frames).
  let pageCount = resolvePackedPrintPageCount({
    multiPage,
    dissolve: dissolvePrintArea && box.dissolved,
    layout: canvas.printPageLayout,
    userPageCount: canvas.printPageCount ?? 1,
    pageWidth: box.pageWidth,
    pageHeight: box.pageHeight,
    margins: box.margins,
    contentBottom: bottomFinal,
    contentRight: rightFinal,
    packLeft: packLeft,
    packTop: packTop,
  })

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

  // Densify / hierarchical re-pack / pixel gaps / multipage seams
  result = refinePlacedCards(result, {
    grid,
    packLeft,
    packTop,
    packRight,
    pageCols,
    folders: options.folders ?? [],
    usePanels,
    multiLevelHierarchy,
    deepLevel,
    shallowLevel,
    leafLevelsStroke,
    outerLevelsStroke,
    blockGapCells,
    blockGapPx,
    leafGapCells,
    l1GapPx,
    l2ContentClearPx,
    l2ContentClearH,
    l2ContentClearV,
    interTopicChromePx,
    outerTitleCells,
    panelPad,
    panelTitleBandPx: PANEL_TITLE_BAND_PX,
    multiPage,
    groupSort,
    box: {
      top: box.top,
      height: box.height,
      pageHeight: box.pageHeight,
      margins: { top: box.margins.top },
      dissolved: box.dissolved,
    },
  })

  const byId = new Map(result.map((p) => [p.id, p]))
  const headingIds = new Set(
    plans.map((p) => p.heading?.id).filter((id): id is string => Boolean(id)),
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
      // Visible body card never placed — pin to pack origin so it still
      // participates in panel chrome (orphans) instead of floating off-sheet.
      if (!old.hidden && !isHeadingCard(old)) {
        return {
          ...old,
          x: packLeft,
          y: packTop,
          autoFit: false,
        }
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
  let merged = [...withoutOldSynth, ...syntheticLabels]

  // ── 7) Layout panels — nested hierarchy + rect AABB or n-gon card runs ─
  let layoutPanels: LayoutPanel[] = []
  if (usePanels) {
    const finalized = finalizeLayoutPanels(result, merged, plans, {
      grid,
      panelPad,
      panelShape,
      usePolyomino,
      useLabels,
      multiLevelHierarchy,
      panelGroupLevels,
      panelBorderLevels: options.panelBorderLevels,
      panelNgonLevels: options.panelNgonLevels,
      folders: options.folders ?? [],
      l1GapPx,
      l2GapPx,
      panelTitleBandPx: PANEL_TITLE_BAND_PX,
      contentLeft: box.left,
      contentRight: box.left + box.width,
      contentTop: box.top,
    })
    merged = finalized.items
    layoutPanels = finalized.layoutPanels
  }

  const bottom2 = merged.reduce(
    (m, it) => (it.hidden ? m : Math.max(m, it.y + it.height)),
    box.top,
  )
  const right2 = merged.reduce(
    (m, it) => (it.hidden ? m : Math.max(m, it.x + it.width)),
    box.left,
  )
  // Layout-aware page frames: grid/horizontal must not collapse to height-only
  // ceil (that deleted right-hand columns after dissolve pack). Content extent
  // only — never invent empty pages from the ideal-cell budget.
  pageCount = resolvePackedPrintPageCount({
    multiPage,
    dissolve: dissolvePrintArea && box.dissolved,
    layout: canvas.printPageLayout,
    userPageCount: canvas.printPageCount ?? 1,
    pageWidth: box.pageWidth,
    pageHeight: box.pageHeight,
    margins: box.margins,
    contentBottom: bottom2,
    contentRight: right2,
    packLeft: box.left,
    packTop: box.top,
  })
  return { items: merged, printPageCount: pageCount, layoutPanels }
}
