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

/** RF `PaddingWithUnit` = number | `${number}px` | `${number}%` */
export type FitViewPadding = {
  top: `${number}px`
  right: `${number}px`
  bottom: `${number}px`
  left: `${number}px`
}

function px(n: number): `${number}px` {
  return `${n}px`
}

/**
 * React Flow fitView padding as pixel units so chrome is discounted
 * independently of viewport size (fractional padding fails on narrow panels).
 */
export function fitViewPaddingForChrome(layout: ChromeLayout): FitViewPadding {
  const insets = CHROME_INSETS[layout]
  return {
    top: px(insets.top + FIT_SLACK_PX),
    right: px(insets.right + FIT_SLACK_PX),
    bottom: px(insets.bottom + FIT_SLACK_PX),
    left: px(insets.left + FIT_SLACK_PX),
  }
}
