import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const srcPath = resolve(root, 'src/lib/autoOrganize/panels.ts')
const outDir = resolve(root, 'src/lib/autoOrganize/panels')
mkdirSync(outDir, { recursive: true })

const lines = readFileSync(srcPath, 'utf8').split(/\r?\n/)
const slice = (a, b) => lines.slice(a - 1, b).join('\n') + '\n'

writeFileSync(
  resolve(outDir, 'hierarchy.ts'),
  `import type { LayoutPanel } from '@/types'

/** True if every member of child is also a member of parent and child is deeper. */
export function isPanelChildOf(parent: LayoutPanel, child: LayoutPanel): boolean {
  if (!parent.memberIds?.length || !child.memberIds?.length) return false
  if ((child.hierarchyLevel ?? 1) <= (parent.hierarchyLevel ?? 1)) return false
  const set = new Set(parent.memberIds)
  return child.memberIds.every((id) => set.has(id))
}

/** Nested under a stroked outer parent (multi-level L2/L3 under L1). */
export function hasOuterStrokedParent(
  p: LayoutPanel,
  all: LayoutPanel[],
): boolean {
  if ((p.hierarchyLevel ?? 1) <= 1) return false
  if (!p.memberIds?.length) return false
  return all.some(
    (o) =>
      o.id !== p.id &&
      o.showStroke !== false &&
      (o.hierarchyLevel ?? 1) < (p.hierarchyLevel ?? 1) &&
      o.memberIds?.length &&
      p.memberIds!.every((id) => o.memberIds!.includes(id)),
  )
}

/**
 * Exclusive title strip height for chrome (must match buildNestedHierarchyPanels).
 * Nested L2/L3 under multi: 0 — chip paints under L1 header in the UI layer.
 */
export function exclusiveTitleBandPx(
  p: LayoutPanel,
  all: LayoutPanel[],
): number {
  if (p.showTitle === false || p.showStroke === false) return 0
  const level = p.hierarchyLevel ?? 1
  if (level <= 1) return 26
  if (hasOuterStrokedParent(p, all)) return 0
  return 18
}
`,
)

writeFileSync(
  resolve(outDir, 'build.ts'),
  `import type { CanvasItem, LayoutPanel, PanelShape } from '@/types'
import {
  ORGANIZE_GRID,
  LAYOUT_PANEL_ACCENTS,
  type PanelGroupLevel,
  normalizePanelGroupLevels,
  normalizeLevelSubset,
  normalizeNgonLevels,
} from '../constants'
import {
  folderAtGroupLevel,
  folderHierarchyPath,
  type FolderRef,
  isHeadingCard,
} from '../folders'
import { chromeFromMembers } from '../polyomino'
import { rectPerimeterPathD } from '../geometry'
import type { TopicSectionPlan } from '../sizing'

${slice(32, 418)}`,
)

// nest: nestContain + rebuildMultiChild + clip; replace isChildOf with shared helper
let nestBody = slice(420, 758) + '\n' + slice(937, 1037)
// Remove local isChildOf definitions (there may be two)
nestBody = nestBody.replace(
  /  const isChildOf = \(parent: LayoutPanel, child: LayoutPanel\) => \{\n(?:    .*\n)*?  \}\n\n/g,
  '',
)
nestBody = nestBody.replace(/isChildOf\(/g, 'isPanelChildOf(')

writeFileSync(
  resolve(outDir, 'nest.ts'),
  `import type { CanvasItem, LayoutPanel } from '@/types'
import { ORGANIZE_GRID } from '../constants'
import { chromeFromMembers } from '../polyomino'
import { rectPerimeterPathD } from '../geometry'
import { isPanelChildOf } from './hierarchy'
import { outlineFromClampedRuns } from './clamp'

${nestBody}`,
)

let clampBody = slice(760, 935)
clampBody = clampBody.replace(
  'function clampRunToBox(',
  'export function clampRunToBox(',
)
clampBody = clampBody.replace(
  'function outlineFromClampedRuns(',
  'export function outlineFromClampedRuns(',
)

writeFileSync(
  resolve(outDir, 'clamp.ts'),
  `import type { LayoutPanel } from '@/types'
import { ORGANIZE_GRID } from '../constants'
import { steppedLChromeFromMembers } from '../polyomino'
import { rectPerimeterPathD } from '../geometry'

${clampBody}`,
)

writeFileSync(
  resolve(outDir, 'merge.ts'),
  `import type { LayoutPanel } from '@/types'
import { ORGANIZE_GRID } from '../constants'
import {
  fillPolyominoHoles,
  closePolyomino,
  polyominoExteriorPathD,
} from '../polyomino'
import { cellsToOrthogonalRuns } from '../freeGrid'
import {
  rectPerimeterPathD,
  panelRunsOverlap,
  rectsOverlap,
} from '../geometry'

${slice(1039, 1234)}`,
)

writeFileSync(
  resolve(outDir, 'relayout.ts'),
  `import type { CanvasItem, LayoutPanel } from '@/types'
import { ORGANIZE_GRID } from '../constants'
import { chromeFromMembers } from '../polyomino'
import { rectPerimeterPathD } from '../geometry'
import { enforcePanelLayoutInvariants } from '../densify'

${slice(1236, 1700)}`,
)

writeFileSync(
  resolve(outDir, 'index.ts'),
  `/**
 * Layout panel chrome: build, nest, clamp, merge, and in-panel relayout.
 */
export {
  buildLayoutPanelsFromMembers,
  buildNestedHierarchyPanels,
} from './build'
export {
  nestContainPanels,
  rebuildMultiChildOuters,
  clipNestedPanelRunsToParents,
} from './nest'
export {
  clampPanelsToContentBox,
  clampPathDToRect,
  clampRunToBox,
  outlineFromClampedRuns,
} from './clamp'
export { mergeAdjacentOutermostPanels } from './merge'
export {
  translateLayoutPanelCluster,
  relayoutPanelContents,
} from './relayout'
export {
  isPanelChildOf,
  hasOuterStrokedParent,
  exclusiveTitleBandPx,
} from './hierarchy'
`,
)

writeFileSync(
  resolve(root, 'src/lib/autoOrganize/panels.ts'),
  `/**
 * Layout panels package — thin re-export for stable import paths.
 * Implementation lives in \`./panels/\`.
 */
export * from './panels/index'
`,
)

console.log('split complete')
