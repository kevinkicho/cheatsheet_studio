# Auto-layout invariants (freeze)

**Full product requirements:** see [`AUTO_LAYOUT_REQUIREMENTS.md`](./AUTO_LAYOUT_REQUIREMENTS.md)
(UI knobs, gap semantics, density floors, pipeline, regressions).

This document stops thrash: **do not change packing algorithms without updating
and passing** `sheet.invariants.test.ts`.

## Symptom history (why this exists)

Fine-tuning one goal repeatedly broke another:

| “Fix” | Broke |
|-------|--------|
| Dense freefall gravity | L1 order (Biology under #6) |
| Restack L1s only | Preserved empty Chemistry shells |
| Dense multi-order leaves | Paint overlaps when mixed with freefall |
| Title in isotropic L2 clear | H gaps ~18px while V was 2px |

Root process failure: **no locked invariants**, soft tests, local patches.

## Locked multi-level pipeline (`postPlace.ts`)

1. Densify **card interiors** per leaf  
2. **`repackGroupsInParents`**: densest L2 pack *inside each L1*; stack L1s by `groupSort`  
3. Axis-aware L2 min-gap (H = gap+2×pad, V = gap+2×pad+title)  
4. **`restackParentClusters`**: hard L1 reading order  
5. Block gap → re-clear L2  
6. Final L1 restack  

**Forbidden without a new invariant + design note:**

- Global gravity/refit with `contentTop = packTop` (cross-L1 freefall)  
- Any pass after restack that moves cards across L1 parents without re-restack  
- Mixing pad/title into free-flow *horizontal* cell budget as if they were frame-to-frame air  

## Priority when goals conflict

1. No same-level paint overlap  
2. L1 order matches Group sort (A→Z / Z→A / document)  
3. Neighbor L2 stroke gap **floor** ≈ user L2 gap (true neighbors)  
4. Density / residual voids (best-effort; not perfect free-flow)

## How to change layout safely

1. Add/adjust a failing assertion in `sheet.invariants.test.ts` first  
2. One hypothesis, one change  
3. Run `vitest run src/lib/autoOrganize/sheet.invariants.test.ts` + cheatsheet suite  
4. Do **not** land if any invariant regresses  

Default pack options for kitchen-sink (match sidebar defaults):

```
density sm, panels rect, L1+L2 borders, groupSort name-asc,
l1/l2/block gap 2, panelPadding 4, multipage + dissolve
```
