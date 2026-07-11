/**
 * Pure keyboard shortcut dispatcher for the workspace canvas.
 * Extracted so unit tests can cover bindings without mounting the full app.
 */

export type ShortcutActions = {
  undo: () => void
  redo: () => void
  removeItems: (ids: string[]) => void
  select: (id: string | null) => void
  setCanvasTool: (tool: 'select' | 'pan') => void
  pastLength: number
  futureLength: number
  selectedIds: string[]
}

export type ShortcutResult =
  | { handled: false }
  | { handled: true; action: string }

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable === true) return true
  // Prefer closest() so labels / SVG icons inside controls don't steal “typing”
  const field = el.closest?.(
    'input, textarea, select, [contenteditable="true"]',
  )
  if (field) {
    const tag = field.tagName?.toLowerCase()
    if (tag === 'input') {
      const type = (field as HTMLInputElement).type?.toLowerCase() ?? 'text'
      // Don't treat buttons/checkboxes as text fields for shortcut suppression
      if (
        type === 'button' ||
        type === 'submit' ||
        type === 'checkbox' ||
        type === 'radio' ||
        type === 'file' ||
        type === 'range' ||
        type === 'color'
      ) {
        return false
      }
    }
    return true
  }
  return false
}

/**
 * Handle a keydown for canvas shortcuts.
 * Returns whether the event was consumed (caller should preventDefault).
 */
export function handleCanvasKeyDown(
  e: Pick<
    KeyboardEvent,
    'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'target'
  >,
  actions: ShortcutActions,
): ShortcutResult {
  const inField = isTypingTarget(e.target)
  const mod = e.ctrlKey || e.metaKey

  if (mod && !inField) {
    const key = e.key.toLowerCase()
    if (key === 'z' && !e.shiftKey && !e.altKey) {
      if (actions.pastLength > 0) actions.undo()
      return { handled: true, action: 'undo' }
    }
    if ((key === 'z' && e.shiftKey) || key === 'y') {
      if (actions.futureLength > 0) actions.redo()
      return { handled: true, action: 'redo' }
    }
  }

  if (inField) return { handled: false }

  if (
    (e.key === 'Delete' || e.key === 'Backspace') &&
    actions.selectedIds.length > 0
  ) {
    actions.removeItems(actions.selectedIds)
    return { handled: true, action: 'delete' }
  }

  if (e.key === 'Escape') {
    actions.select(null)
    return { handled: true, action: 'deselect' }
  }

  if (!e.metaKey && !e.ctrlKey && !e.altKey) {
    if (e.key === 'v' || e.key === 'V') {
      actions.setCanvasTool('select')
      return { handled: true, action: 'tool-select' }
    }
    if (e.key === 'h' || e.key === 'H') {
      actions.setCanvasTool('pan')
      return { handled: true, action: 'tool-pan' }
    }
  }

  return { handled: false }
}
