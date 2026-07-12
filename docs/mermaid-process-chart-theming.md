# Process chart theming — investigation log

**Product:** CheatSheet Studio — Process panel preview + canvas `process-chart` cards  
**Mermaid version:** `11.16.0`  
**Status:** Undesirable dark-UI rendering across ~15 user screenshots (2026-07-11). Instruction = Theme **Dark** + app chrome; output still light/default-style nodes.

**Success means (user wording):** Mermaid must **draw as instructed** — dark fill + light grey/white type on Studio chrome. Pale/white default skin on a dark panel is a **failed draw**, not “layout OK.”

---

## 1. Goal

| Instruction | Expected |
|-------------|----------|
| Process Theme = **Dark** | Dark node fills, light labels, muted edges |
| App chrome | Align with Studio zinc (preview pane, field-input) |
| Theme = **Forest** | Keep Mermaid light/green path for print-ish use |

**Target tokens (intended app mapping):**

| Token | Hex | App analogue |
|-------|-----|----------------|
| Preview pane | `#12141a` | Process panel `bg-[#12141a]` |
| Node fill | `#18181b` | `.field-input` background |
| Node stroke | `#3f3f46` | zinc-700 |
| Node text | `#e4e4e7` | field-input / body text |
| Edge | `#71717a` | zinc-500 |

---

## 2. Screenshot evidence (summary)

Across Process preview and `mermaid-test.html` captures:

- Node **bodies** frequently **lavender** (`rgb(236,236,255)` / `#ECECFF`) or **pure white** (`255,255,255`).
- Same family of look as Mermaid **default** demos on GitHub (light diagram skin).
- Theme dropdown often **Dark** while preview still reads as light nodes.
- Automated “PASS” on test pages was **wrong** when the bitmap still showed white/pale nodes (see §6).

Conclusion: **undesirable rendering is consistent** relative to the Dark + app-chrome instruction.

---

## 3. What we tried (and why it failed vs screenshots)

### 3.1 Named theme `dark`

- `mermaid.initialize({ theme: 'dark' })` and UI Theme = Dark.
- **Intent:** Official dark skin.
- **Result:** Screenshots still often showed light/default-like nodes, or did not match Studio zinc. Not accepted as “drawn as instructed” for the product.

### 3.2 `theme: 'base'` + `themeVariables`

- Full set: `primaryColor` / `mainBkg`, `primaryTextColor`, `nodeBorder`, `lineColor`, `darkMode: true`, clusters, edge labels, `useGradient: false`, Inter-like `fontFamily`.
- **Intent:** Official custom palette ([Mermaid theming docs](https://mermaid.js.org/config/theming.html) — only `base` is fully customizable).
- **Result:** Config and SVG `<style>` often reported correct `mainBkg` / CSS `fill`. User bitmaps still showed pale/white node **bodies**. Variables alone did not guarantee the visible surface.

### 3.3 `themeCSS` (string, often with `!important`)

- Injected rules for `.node path/rect`, labels, edges.
- **Intent:** Strengthen Mermaid’s injected sheet.
- **Result:** Competes with Mermaid’s own `#svgId …` rules and presentation attrs; did not produce accepted screenshots. Treated as **host-style fighting** (see §5).

### 3.4 `classDef default` / diagram `style NodeId …`

- Injected or author-written flowchart styling (official Mermaid syntax).
- **Intent:** Mermaid applies class styles during draw (`styles2String` → element `style` with `!important`; rough `userNodeOverrides` can read `stylesMap.fill`).
- **Result:** Incomplete / inconsistent on v11 flowchart paths in practice; author `style` without correct node id does nothing; screenshots still often default-looking.

### 3.5 Post-render DOM paint (“hard paint”)

- After `mermaid.render`: walk `g.node path|rect|…`, set `fill`/`stroke` and `style.setProperty(..., 'important')`; light text on labels.
- Also: `applyStudioDarkSvg` via `DOMParser`; second paint in `useLayoutEffect` after React commit.
- Palettes tried: `#52525b`, `#27272a`, `#1f2020`, `#3f3f46`, `#18181b` + light text.
- **Intent:** Force pixels when themeVariables failed.
- **Result:** Red-fill experiments proved **some** DOM paint can change pixels; Studio screenshots **still** often white/pale. Double paint + async measure path introduced **races** and false confidence. User asked for **no overrides** going forward.

### 3.6 Process panel wiring only

- `forceDark={theme !== 'forest'}`, serialized `renderMermaidSvg` queue, `htmlLabels: false`.
- **Intent:** Always use studio path for Dark UI.
- **Result:** Wiring present; visual instruction still not met in Process screenshots.

### 3.7 SCSS / host CSS migration

- **Not required.** SCSS compiles to CSS; Mermaid does not require SCSS. External host CSS is **not** the recommended theming path and loses to Mermaid’s SVG-scoped styles.

---

## 4. Rendering sequence (app vs Mermaid)

### 4.1 App sequence (current)

```
CreateProcessChartPanel / CanvasItemView
  └─ MermaidView(source, theme, forceDark, scale)
       │
       ├─ useEffect([source, theme, studioDark])
       │    ├─ renderMermaidSvg({ id, source, theme, studioDark })  // serialized queue
       │    │    ├─ mermaid.initialize(mermaidInitOptions(...))     // site config + theme
       │    │    ├─ [studio] injectStudioClassDef(source)           // mutates source string
       │    │    ├─ mermaid.render(id, source) → { svg: string }
       │    │    └─ [studio] applyStudioDarkSvg(svg)                // DOMParser + paint (override)
       │    ├─ off-DOM div.innerHTML = svg  (measure)
       │    ├─ [studio] paintStudioDarkRoot(svgEl) again            // override
       │    └─ setMarkup(svgEl.outerHTML) → React state
       │
       ├─ render: dangerouslySetInnerHTML on .mermaid-host
       │
       └─ useLayoutEffect([markup])
            └─ paintStudioDarkRoot(host svg) again                  // override + race surface
```

**Race / multi-write surfaces today:**

| Step | Risk |
|------|------|
| `initialize` every render | Global Mermaid site config; concurrent charts must serialize (queue helps). |
| `injectStudioClassDef` + author source | Two sources of truth for classDef. |
| `render` then string paint then measure paint then layout paint | **3 paint passes**; cancelled effects can interleave with newer runs. |
| `dangerouslySetInnerHTML` | Drops live DOM; layout effect re-paints after commit. |
| Random `id` per render | Avoids SVG id collisions; forces full redraw each time. |

### 4.2 Mermaid internal sequence (v11, simplified)

From Mermaid render path + flowchart styling helpers (`userNodeOverrides`, `styles2String`, diagram `getStyles`):

```
mermaid.initialize(config)
  └─ siteConfig: theme, themeVariables, themeCSS, flowchart, securityLevel, …

mermaid.render(id, text)
  ├─ parse / detect diagram type (flowchart, …)
  ├─ merge config (site + optional frontmatter / %%{init}%%)
  ├─ build themeVariables (named theme + user overrides; derive colors if darkMode)
  ├─ create temp DOM (div#d{id} + svg#id) — or sandbox iframe if securityLevel sandbox
  ├─ getStyles(diagramType, themeCSS, themeVariables, svgId)
  │    └─ insert <style> into SVG:  #id .node path { fill: mainBkg; … }
  ├─ diagram.renderer.draw(text, id, version, diag)
  │    └─ per node shape (rough.js / classic):
  │         userNodeOverrides(node):
  │           fill  = stylesMap.fill || themeVariables.mainBkg
  │           stroke = stylesMap.stroke || themeVariables.nodeBorder
  │         → path presentation attrs (observed default lavender when mainBkg not applied)
  │         classDef / style → styles2String → element style="fill:… !important"
  ├─ optional DOMPurify.sanitize(svg) unless securityLevel === 'loose'
  └─ return { svg: string, bindFunctions? }
```

**Critical observation (probed):** Flowchart node paths often retain presentation `fill="#ECECFF"` (default theme primary) even when `getConfig().themeVariables.mainBkg` is already Studio dark after `initialize`. CSS in the SVG may list the dark fill; the **visible body** in user screenshots still tracked light/default.

`userNodeOverrides` (mermaid core):

```js
fill: stylesMap.get("fill") || mainBkg   // classDef fill wins if present
stroke: stylesMap.get("stroke") || nodeBorder
```

So **during draw**, rough fill is supposed to come from **classDef fill** or **mainBkg**. If presentation attrs stay `#ECECFF`, either `mainBkg` was still default at draw, or another code path sets the path fill.

### 4.3 After Mermaid returns (app)

1. React stores SVG HTML string.  
2. Browser parses HTML into live SVG under `.mermaid-host`.  
3. Cascade: SVG `<style #id …>` + presentation attrs + inline `style` + any host CSS.  
4. Optional app paints mutate live DOM (current; to be removed under “no overrides” plan).

---

## 5. Competing stylesheets and paint sources

### 5.1 Who owns what

| Layer | Owner | Scope | Notes |
|-------|--------|--------|--------|
| `index.css` `.mermaid-host svg` | **App** | layout only | `background: transparent; display: block` — **no fill colors** |
| Tailwind / app chrome | **App** | panels, preview `#12141a`, field-input | Does not target Mermaid node paths (by design) |
| SVG `<style>` `#mmd-… .node path { fill: … }` | **Mermaid** | per-render svg id | From `themeVariables` (+ diagram styles) |
| `themeCSS` string | **App → Mermaid** | merged into SVG styles | Competes inside Mermaid’s sheet |
| Path `fill="…"` presentation attr | **Mermaid draw (rough)** | per shape | Observed `#ECECFF` under default-like draws |
| Element `style="fill:… !important"` | **Mermaid classDef/style** | per node | From `styles2String` |
| Post-render `setProperty('fill',…,'important')` | **App override** | live DOM | Multiple passes; race-prone; **not** SDK instruction |

### 5.2 Cascade order (simplified SVG)

Higher wins for the same property when specificity/`!important` allow:

1. Inline `style` with `!important` (classDef / app paint)  
2. SVG `<style>` rules with `!important` (`themeCSS` / some Mermaid rules)  
3. SVG `<style>` normal rules (`#id .node path { fill: mainBkg }`)  
4. Presentation attributes (`fill="#ECECFF"`) — normally lose to author CSS, but **pixel outcome** still tracked light in screenshots  
5. Host page CSS — usually loses to `#id`-scoped Mermaid rules; **not** a reliable theming tool  

### 5.3 Why “attributes said dark, screenshot said white”

- **Not** “attributes lie.” The DOM reports the rule for the element we queried.  
- Failures we hit:
  1. Queried/sampled **background** or wrong shape (near `#12141a` ≈ `#18181b` → false PASS).  
  2. Multiple shapes per node (path + outline path + zero-size rects); checked one, saw another.  
  3. **Instruction path** (Dark + variables) did not produce dark **node body pixels**.  
  4. Near-black fill on near-black pane can look empty even when dark.

---

## 6. False PASS on mermaid-test (do not repeat)

**Broken check (removed in intent):**

- Prefill canvas with `#12141a`, rasterize SVG, sample fixed `(width/2, y=40)`.  
- That point often hit **pane/background**, not a node body.  
- `#12141a` (`~18,20,26`) is within ~12 of `#18181b` (`24,24,27`) → `near()` returned true → green PASS.  
- User screenshots of the same page: studio **node bodies** `rgb(255,255,255)` / light greys.

**Honest check requirements:**

- Sample **centers of solid node shapes** (`getBBox` width/height &gt; threshold).  
- Fail if any body sample is pale (luma &gt; ~0.55).  
- Pass only if bodies are dark **and** readable against the preview pane.  
- Prefer screenshot / element clip of Process preview, not fillAttr alone.

---

## 7. Current code map

| File | Role |
|------|------|
| `src/lib/mermaidTheme.ts` | Init options, variables, classDef inject, paint helpers, serialized `renderMermaidSvg` |
| `src/components/math/MermaidView.tsx` | React lifecycle, measure, double paint, `dangerouslySetInnerHTML` |
| `src/components/tools/CreateProcessChartPanel.tsx` | Process UI; `forceDark={theme !== 'forest'}`; preview `#12141a` |
| `src/components/canvas/CanvasItemView.tsx` | Canvas cards; same forceDark rule |
| `src/components/export/PdfExportPages.tsx` | `forceDark={false}` for print |
| `src/index.css` | `.mermaid-host svg` layout only |
| `public/mermaid-test.html` | Manual harness (historically misleading PASS) |

---

## 8. Related docs

- [Implementation plan (no overrides, no races)](./mermaid-implementation-plan.md)  
- Mermaid official theming: https://mermaid.js.org/config/theming.html  
- Mermaid flowchart styling (`style` / `classDef`): https://mermaid.js.org/syntax/flowchart.html  

---

## 9. Glossary

| Term | Meaning |
|------|---------|
| **Instruction** | UI Theme Dark + Studio chrome palette |
| **Failed draw** | Output does not match instruction (pale/white nodes on dark UI) |
| **Override** | App post-render DOM/CSS mutation of Mermaid’s SVG after `render()` |
| **SDK path** | `initialize` theme/themeVariables/themeCSS, frontmatter/`%%{init}%%`, diagram `classDef`/`style` |
