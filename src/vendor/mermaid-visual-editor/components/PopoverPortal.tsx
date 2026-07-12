import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'

type Props = {
  /** Element that owns the popover (button or wrapper including the toggle). */
  anchorRef: RefObject<HTMLElement | null>
  /**
   * Clicks outside this root close the popover. Defaults to anchorRef.
   * Pass a wrapper that includes the trigger so re-clicking the button
   * is not treated as an outside click (which would fight the toggle).
   */
  rootRef?: RefObject<HTMLElement | null>
  onClose: () => void
  children: ReactNode
  /** Horizontal alignment relative to the anchor. */
  align?: 'center' | 'start' | 'end'
  className?: string
  style?: CSSProperties
  /** Max height of the panel (scrolls if taller). */
  maxHeight?: number
}

/**
 * Renders a dropdown under `anchorRef` via document.body portal so it is not
 * clipped by overflow:hidden / transform on the Process editor chrome.
 */
export function PopoverPortal({
  anchorRef,
  rootRef,
  onClose,
  children,
  align = 'center',
  className,
  style,
  maxHeight = 320,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{
    top: number
    left: number
    transform: string
    maxH: number
  } | null>(null)

  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef.current
      if (!anchor) return
      const r = anchor.getBoundingClientRect()
      const gap = 8
      const spaceBelow = window.innerHeight - r.bottom - gap - 12
      const spaceAbove = r.top - gap - 12
      // Prefer below; flip above only if far more room up and little below
      const openBelow = spaceBelow >= 120 || spaceBelow >= spaceAbove
      const maxH = Math.max(
        120,
        Math.min(maxHeight, openBelow ? spaceBelow : spaceAbove),
      )

      let left = r.left + r.width / 2
      let transform = 'translateX(-50%)'
      if (align === 'start') {
        left = r.left
        transform = 'none'
      } else if (align === 'end') {
        left = r.right
        transform = 'translateX(-100%)'
      }

      // Keep panel on-screen horizontally (approx width 320)
      const half = 160
      if (align === 'center') {
        left = Math.min(
          window.innerWidth - half - 8,
          Math.max(half + 8, left),
        )
      } else if (align === 'start') {
        left = Math.min(window.innerWidth - 16, Math.max(8, left))
      } else {
        left = Math.min(window.innerWidth - 8, Math.max(16 + 280, left))
      }

      setBox({
        top: openBelow ? r.bottom + gap : r.top - gap,
        left,
        transform: openBelow
          ? transform
          : `${transform === 'none' ? '' : transform} translateY(-100%)`.trim(),
        maxH,
      })
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchorRef, align, maxHeight])

  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node
      const root = rootRef?.current ?? anchorRef.current
      const panel = panelRef.current
      if (root?.contains(t) || panel?.contains(t)) return
      onClose()
    }
    // pointerdown so we close before other handlers; root includes the toggle
    // so re-clicking the button does not fight the open/close toggle.
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer, true)
    }
  }, [onClose, anchorRef, rootRef])

  if (!box || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={panelRef}
      className={className}
      data-mermaid-popover
      style={{
        position: 'fixed',
        top: box.top,
        left: box.left,
        transform: box.transform,
        zIndex: 10_000,
        maxHeight: box.maxH,
        overflowY: 'auto',
        overflowX: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>,
    document.body,
  )
}
