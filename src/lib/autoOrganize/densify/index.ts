/**
 * Post-place densify / collision / panel invariant passes.
 * Split from the former monolithic densify.ts for maintainability.
 */
export { ensureLeafTitleClearance } from './titleClearance'
export { densifyPlacedGroups } from './densifyGroups'
export { resolveLeafGroupCollisions } from './leafCollisions'
export { gravityCompactGroups } from './gravity'
export { repackLeafInteriors } from './repackLeaves'
export { repackGroupsInParents } from './repackParents'
export { separateFolderClusters } from './separateClusters'
export { resolveCardOverlaps, separateLeafCardsByGap } from './cardGaps'
export { resolveSameLevelPanelCollisions } from './panelCollisions'
export { enforcePanelLayoutInvariants } from './enforceInvariants'