# Auto-organize package

Modular cheatsheet free-flow packer + nested panel chrome.

## Import

```ts
import { packCheatsheetLayout, ORGANIZE_GRID } from '@/lib/autoOrganize'
```

The parent file `src/lib/autoOrganize.ts` re-exports this barrel for compatibility.

## Modules

| File | Responsibility |
|------|----------------|
| `constants.ts` | Grid, density/chrome presets, option types, level normalizers |
| `contentBox.ts` | Printable content box, multipage origins, snap helpers |
| `layoutRows.ts` | Simple row shelf layout (`layoutItemsInRows`) |
| `folders.ts` | Folder hierarchy, section splits, heading detection |
| `sizing.ts` | Ideal card sizes, scale, natural topic pack |
| `shelf.ts` | Dense free-flow region placement, hierarchical place |
| `freeGrid.ts` | Orthogonal cell runs for n-gon chrome |
| `polyomino.ts` | N-gon cells, exterior paths, `chromeFromMembers` |
| `panels/` | Nested layout panels (build, nest, clamp, merge, relayout) |
| `panels.ts` | Thin re-export of `panels/` for stable imports |
| `multipage.ts` | Page straddle resolve + gutter insert |
| `densify.ts` | Leaf densify + collision separation |
| `exportTags.ts` | Export filename auto-layout tags |
| `packCheatsheet.ts` | **Main orchestrator** `packCheatsheetLayout` |
| `geometry.ts` | Rect overlaps, perimeter paths |
| `index.ts` | Public barrel |

## Notes

- Prefer editing the module that owns the concern rather than growing `packCheatsheet.ts`.
- Keep public names stable; tests and the UI import from `@/lib/autoOrganize` only.
