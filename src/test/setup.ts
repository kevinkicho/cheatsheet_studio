import React from 'react'
import '@testing-library/jest-dom/vitest'

// Vitest may not inject the automatic JSX runtime; expose React for classic JSX.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).React = React


/**
 * jsdom has no real Canvas2D. CanvasGridLayer builds a pattern via
 * getContext/toDataURL — stub enough to produce a non-empty data URL.
 */
function installCanvasStub() {
  if (typeof HTMLCanvasElement === 'undefined') return

  const proto = HTMLCanvasElement.prototype as HTMLCanvasElement & {
    __grokCanvasStub?: boolean
  }
  if (proto.__grokCanvasStub) return
  proto.__grokCanvasStub = true

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proto.getContext = function getContext() {
    return {
      setTransform() {},
      clearRect() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      fillRect() {},
      scale() {},
      save() {},
      restore() {},
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D
  } as typeof HTMLCanvasElement.prototype.getContext

  proto.toDataURL = function toDataURL() {
    return 'data:image/png;base64,gridpatternstub'
  }
}

installCanvasStub()

// ResizeObserver (FitContent / panels)
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(globalThis, 'ResizeObserver', {
  value: ResizeObserverStub,
  configurable: true,
})

// zustand persist
const mem = new Map<string, string>()
const storage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => {
    mem.set(k, v)
  },
  removeItem: (k: string) => {
    mem.delete(k)
  },
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size
  },
}
Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
})
