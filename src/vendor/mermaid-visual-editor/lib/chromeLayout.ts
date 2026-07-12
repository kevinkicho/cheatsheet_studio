/**
 * Floating tool chrome (top/bottom or left/right rails) for the Process editor.
 * Used for positioning bars and zoom-fit padding so content clears the chrome.
 */

export type ChromeLayout = 'horizontal' | 'vertical'

/**
 * Approximate chrome thickness in CSS px (matches scale-90 toolbars + padding).
 * Extra slack so nodes clear bars and hover handles.
 */
export const CHROME_INSETS = {
  horizontal: {
    top: 64,
    bottom: 80,
    left: 20,
    right: 20,
  },
  vertical: {
    top: 20,
    bottom: 28,
    left: 72,
    right: 72,
  },
} as const

/** Extra breathing room beyond chrome bars (px). */
const FIT_SLACK_PX = 16

export type FitViewPadding = {
  top: string
  right: string
  bottom: string
  left: string
}

/**
 * React Flow fitView padding as pixel strings so chrome is discounted
 * independently of viewport size (fractional padding fails on narrow panels).
 */
export function fitViewPaddingForChrome(layout: ChromeLayout): FitViewPadding {
  const insets = CHROME_INSETS[layout]
  return {
    top: `${insets.top + FIT_SLACK_PX}px`,
    right: `${insets.right + FIT_SLACK_PX}px`,
    bottom: `${insets.bottom + FIT_SLACK_PX}px`,
    left: `${insets.left + FIT_SLACK_PX}px`,
  }
}
