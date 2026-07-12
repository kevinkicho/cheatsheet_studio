# Why isolation screenshots worked but the app still looked pale

## Records we do have

| Artifact | What it proved | What it did **not** prove |
|----------|----------------|---------------------------|
| `screenshots/verify-v5-again.png` | Post-render hard paint → dark nodes on a **standalone HTML page** | Process panel in React `/app` |
| `screenshots/theme-trials/verify-app-stack-studio-host.png` | `base` + themeVariables + frontmatter + `classDef` → `#27272a` dark host PNG | Same stack mounted via `MermaidView` + React |
| `scripts/verify-studio-theme-screenshot.mjs` | Exact code that produced STUDIO_DARK_OK | That code was **not** in `renderMermaidSvg` until late; even then app screenshots stayed pale |
| Session compaction `segment_006.md` | Full write history of `mermaid-test.html` hardPaint, mermaidTheme rewrites | User Chrome still measured white on Process preview |

There is **no git commit** of a “known good app build” — Process chart theming lives as untracked/WIP files. The good screenshots are from **Playwright isolation harnesses**, not from a logged-in app session.

## What went wrong methodologically

1. **Proved A, claimed B**  
   Isolation `setContent` + `innerHTML` looked dark → assumed React `dangerouslySetInnerHTML` + MermaidView would match. User screenshots of `/app` kept showing pale nodes.

2. **Thrashing mermaid-test**  
   User confirmed verify-v5-again, then test page was rewritten to official-only and back. Confidence in the harness eroded.

3. **False confidence metrics**  
   DOM `fillAttr` / `computed` could say `#1f2020` while full-window user PNGs still had large white regions on node bodies.

4. **Stack never closed the last mile**  
   `prepareStudioDarkSource` + hard paint were added to `mermaidTheme.ts`, but Mermaid’s injected SVG `<style>` and the app cascade still left user-visible pale fills. Isolation didn’t include that full chrome.

## Root cause for *your* Chrome screenshots (183700, 183633, …)

Pixel audit of the **same** mermaid-test page:

| Capture | white≈ | near dark |
|---------|-------:|----------:|
| `Screenshot 2026-07-11 183700.png` (your Chrome) | **6919** | ~84 |
| Playwright `diag-mermaid-test-full.png` (headless) | ~143 | **~6600** |
| `verify-v5-again.png` (agent Playwright) | ~96 | **~40000** |

DOM log on your 183700 still said `fillAttr: #27272a` / `computed: rgb(39,39,42)` while the **PNG is white**.  
That pattern matches **Chrome Auto Dark Mode / forced-colors inverting SVG** after layout: DOM reports the authored color; the compositor shows the inverted result. Headless Playwright does not apply that mode → agent “PROOF_OK” while your eyes see white.

Also: node labels on 183700 look blank (light text + inverted/light fill).

## Fix that closes the last mile

1. **`forced-color-adjust: none`** + **`color-scheme: dark`** on `.mermaid-host` / SVG / mermaid-test (and app `index.css`).
2. **Strip Mermaid’s injected `<style>`** (ID selectors like `#d2 .node rect` beat host class CSS) and re-inject **id-scoped** studio paint CSS.
3. Keep **prepareStudioDarkSource** + **hard paint attrs** (`!important` inline).

## How to re-verify

```bash
npm run build
# serve dist — confirm index-DuLQl4mo.js + index-C1iV1bbh.css (or current hashes)
```

Hard refresh **Ctrl+Shift+R**:

- `/mermaid-test.html` — cards 2–3 must look like `verify-v5-again` / `verify-app-stack-studio-host` (dark zinc, light text visible)
- `/app` Process preview Theme Dark — same

If still white: in Chrome open `chrome://flags`, search **Auto Dark Mode for Web Contents**, set **Disabled**, restart Chrome, retest. That isolates forced-colors if CSS opt-out is not enough.
