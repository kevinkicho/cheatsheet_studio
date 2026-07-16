# Canvas store (sliced)

Public import remains `@/stores/canvasStore` → re-exports `useCanvasStore`.

| Module | Responsibility |
|--------|----------------|
| `types.ts` | `CanvasState`, `CanvasDocSnapshot`, `emptyCanvasState` |
| `history.ts` | Undo/redo snapshots + batch flags |
| `workspace.ts` | Freeform / print-frame board sizing |
| `slices/historySlice.ts` | `undo` / `redo` / history batch |
| `slices/sheetSlice.ts` | Load/reset, print pages, grid, margins |
| `slices/layoutSlice.ts` | Sheet `autoOrganize` + `applyItemLayout` |
| `slices/selectionSlice.ts` | Card/panel multi-select |
| `slices/panelsSlice.ts` | Layout panels, in-panel auto-layout |
| `slices/itemsSlice.ts` | Cards: add/update/move/resize/z-order |
| `slices/foldersSlice.ts` | Layers collections + panel membership sync |
| `index.ts` | Composes slices + history subscription |

When adding store actions, put them in the matching slice and extend `CanvasState` in `types.ts`.
