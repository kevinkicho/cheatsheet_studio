# Mermaid Process Chart Dark Theme — Working Record

**Status:** WORKING (user-confirmed 2026-07-11 ~18:51)  
**Surfaces:** CheatSheet Studio Process preview (`/app`) + `public/mermaid-test.html`

---

## 1. Confirmed working screenshots

| Surface | User shot | Archived copy |
|---------|-----------|---------------|
| **App Process PREVIEW** | `screenshots/Screenshot 2026-07-11 185123.png` | `screenshots/theme-trials/user-185123-app-WORKING.png`, `docs/user-185123-app-WORKING.png` |
| **mermaid-test** (dark OK earlier) | `screenshots/Screenshot 2026-07-11 183944.png` | `screenshots/theme-trials/user-183944-mermaid-test-WORKING.png` |
| **Agent layout-fit proof** | `screenshots/theme-trials/layout-fit-full.png` | full 3-card dark paint with labels inside boxes |

### What “working” looks like

- Theme **Dark** Process preview: **zinc node fills** (`#27272a`), **light labels** (`#f4f4f5`), gray strokes/edges.
- Full label text visible inside boxes (“Collect input”, “Process data”, “Valid?”, Yes/No chips — not mid-word clip).
- **Not** Mermaid default pale lavender (`#ECECFF`).
- mermaid-test: card 1 = raw pale control; cards 2–3 = dark studio paint; card 3 Start can be green.

### Failure references (do not regress)

| Shot | Symptom | Cause |
|------|---------|--------|
| `183700` mermaid-test | White nodes; DOM still said `#27272a` | Chrome Auto Dark / forced-colors **inverting SVG** |
| `183633` / earlier app shots | Pale/white Process preview | Same inversion + paint not applied end-to-end |
| `184747` mermaid-test | Dark fills but text **out of bounds**, black Yes/No chips | Paint **deleted Mermaid `<style>`** (lost font metrics) |

---

## 2. Root causes (in order discovered)

### A. Chrome dark mode + dark page → SVG color inversion

- **Symptom:** `fillAttr` / `computed` = `#27272a` / `rgb(39,39,42)` but user PNG pixels ~white.
- **Playwright headless:** same page measured dark (no Auto Dark).
- **User Chrome:** measured white (inversion).
- **Fix:** `color-scheme: dark` + **`forced-color-adjust: none`** on `html`, `.mermaid-host`, SVG; meta `color-scheme`.

### B. Isolation proofs ≠ React app path

- Working isolation: `verify-app-stack-studio-host.png`, `verify-v5-again.png` (agent Playwright harnesses).
- App failed until stack was wired into `MermaidView` + host CSS + inversion fix.

### C. Label overflow after paint

- **Symptom:** “Collect inpu…”, “Process dat…”, black edge chips (184747).
- **Cause:** hard paint **removed Mermaid’s injected `<style>`**, including `font-size` used when node boxes were laid out; re-injected colors only → text reflowed wider than boxes; edge-label styles lost.
- **Fix:** **rewrite pale fills in place**; do **not** delete Mermaid font rules; inject id-scoped **color** overrides only; paint edge labels explicitly.

---

## 3. Final stack (do not thrash without need)

### Palette (`STUDIO_DARK` in `src/lib/mermaidTheme.ts`)

| Token | Value |
|-------|--------|
| nodeFill | `#27272a` |
| nodeStroke | `#71717a` |
| nodeText | `#f4f4f5` |
| edge | `#a1a1aa` |
| edgeLabelBg | `#3f3f46` |
| preview bg | `#12141a` |

### Render pipeline

1. **`mermaid.initialize`**
   - `theme: 'base'`
   - `themeVariables` = `MERMAID_DARK_THEME_VARIABLES`
   - `htmlLabels: true` (root + flowchart) so boxes match label metrics
   - font: `trebuchet ms, verdana, arial, sans-serif`, `fontSize: 16px`
2. **`prepareStudioDarkSource(source)`**
   - YAML frontmatter with same themeVariables
   - `classDef default fill:#27272a,stroke:#71717a,color:#f4f4f5`
3. **`mermaid.render`**
4. **`paintStudioSvg` / `applyStudioPaintToSvgString`**
   - Rewrite `#ECECFF` etc. in Mermaid `<style>` (keep font rules)
   - Inject id-scoped color CSS (`data-studio-paint`)
   - Force presentation + `style !important` on node shapes / edges / edge labels
   - foreignObject label: light text, transparent bg
   - SVG: `forced-color-adjust: none`, `overflow: visible`
5. **`MermaidView`**
   - Offscreen measure + paint, then `dangerouslySetInnerHTML`
   - `useLayoutEffect` re-paint after commit
   - `data-mermaid-dark="true"` when studio dark
   - Size from content bbox + slight viewBox pad so scale doesn’t clip labels
6. **Host CSS** (`src/index.css`)
   - `.mermaid-host` + `[data-mermaid-dark='true']` color rules
   - `forced-color-adjust: none`, `color-scheme: dark`

### Key files

| File | Role |
|------|------|
| `src/lib/mermaidTheme.ts` | Init, prepare source, layout-safe paint |
| `src/components/math/MermaidView.tsx` | React mount + re-paint |
| `src/components/tools/CreateProcessChartPanel.tsx` | `forceDark={theme !== 'forest'}` |
| `src/index.css` | Host dark + inversion opt-out |
| `index.html` | `meta name="color-scheme" content="dark"` |
| `public/mermaid-test.html` | Isolation 3-card harness (same paint rules) |

### Process panel wiring

```tsx
<MermaidView
  source={source}
  theme={theme}
  forceDark={theme !== 'forest'}
  scale={previewZoom}
  ...
/>
```

Canvas cards use the same `forceDark` pattern in `CanvasItemView`.

---

## 4. Verification scripts (agent)

| Script | Purpose |
|--------|---------|
| `scripts/verify-studio-theme-screenshot.mjs` | Original stack proof → `verify-app-stack-studio-host.png` |
| `scripts/verify-v5.mjs` | Hard-paint era proof → `verify-v5-again.png` |
| `scripts/proof-label-fit.mjs` | Labels fit after layout-safe paint → `layout-fit-*.png` |
| `scripts/proof-app-stack-applied.mjs` | Palette/host pixel check |
| `npx vitest run src/lib/mermaidTheme.test.ts` | Unit tests for init + paint + prepare |

---

## 5. Regression checklist

Before changing theming:

1. [ ] Real Chrome (not only headless): dark site + system dark mode still shows **dark** nodes (not inverted white).
2. [ ] Labels fully inside boxes at Process preview ~50% zoom.
3. [ ] Yes/No edge chips readable (zinc chip + light text, not solid black).
4. [ ] mermaid-test card 1 still pale; cards 2–3 dark.
5. [ ] Do **not** delete Mermaid SVG `<style>` wholesale — only recolor fills.
6. [ ] Keep `forced-color-adjust: none` on mermaid host/SVG.

---

## 6. Timeline (compressed)

| Time (2026-07-11) | Event |
|-------------------|--------|
| Afternoon | Isolation trials; false PASSes on attrs; user pale screenshots |
| ~17:41 | `verify-v5-again.png` — hard paint dark (Playwright) |
| ~18:13 | `verify-app-stack` STUDIO_DARK_OK (`#27272a`) |
| ~18:16–18:37 | User: still pale; inversion diagnosis |
| ~18:39 | mermaid-test 183944 WORKING (forced-color-adjust) |
| ~18:47 | 184747 overflow FAIL (style strip) |
| ~18:51 | **App 185123 WORKING** (user confirmed) |

---

## 7. File hashes (record time)

| File | SHA256 (prefix) |
|------|-----------------|
| `Screenshot 2026-07-11 185123.png` | `B6A86FD06B825B3C…` |
| `public/mermaid-test.html` | `D1B27168850CA2C8…` |
| `src/lib/mermaidTheme.ts` | `CA2A0647A32A642E…` |
| `src/components/math/MermaidView.tsx` | `20C26233423C29CA…` |
| `src/index.css` | `2CB28E1A7B97A81B…` |

Build at confirmation (approx): `index-DCj59TLs.js` + `index-BBzPV5yx.css` (hashes change on rebuild).

---

## 8. Related docs

- `docs/WHY_ISOLATION_WORKED_APP_DIDNT.md` — inversion + isolation gap
- `docs/STATE_RECORD_2026-07-11_1816.md` — earlier pixel audits
- `docs/mermaid-theme-trials-RESULTS.md` — trial matrix
- Official Mermaid theming: https://mermaid.ai/open-source/config/theming.html

---

*Record written after user confirmation: app (185123) + mermaid-test working. Do not claim PASS without user visual or host-PNG proof under real Chrome dark mode.*
