# Process chart theming — implementation plan

**Official reference:** [Mermaid Theme Configuration](https://mermaid.ai/open-source/config/theming.html)

**Constraint (product):** No post-render overrides (no DOM paint stacks, no host CSS color wars, no `useLayoutEffect` re-paint).  
**Constraint (engineering):** No races — one config, one render, one SVG string commit per request.  
**Goal:** Theme **Dark** draws dark fills + light grey/white labels as **instructed**, readable on Process preview `#12141a`.  

Background and failed experiments: [mermaid-process-chart-theming.md](./mermaid-process-chart-theming.md).

## Implemented (official path)

As of the official-theming cleanup:

```ts
mermaid.initialize({
  theme: 'base',              // only modifiable theme per docs
  themeVariables: {           // hex colors; darkMode: true
    darkMode: true,
    background: '#12141a',
    primaryColor: '#27272a',  // node fill (docs)
    primaryTextColor: '#f4f4f5',
    primaryBorderColor: '#71717a',
    mainBkg: '#27272a',
    lineColor: '#a1a1aa',
    // …
  },
})
const { svg } = await mermaid.render(id, source)
// mount svg — no mutation
```

Code: `src/lib/mermaidTheme.ts`, `src/components/math/MermaidView.tsx`.

---

## 0. Principles

1. **Only Mermaid’s instruction channels**  
   - `mermaid.initialize({ theme, themeVariables, … })`  
   - Optional diagram frontmatter / `%%{init}%%`  
   - Optional flowchart `classDef` / `style` **in the source string before `render`** (diagram language, not post-DOM mutation)

2. **No overrides**  
   Remove / do not reintroduce:
   - `paintStudioDarkRoot` / `applyStudioDarkSvg` after render  
   - `themeCSS` used as a second competing `!important` layer for the same jobs as `themeVariables`  
   - Host CSS targeting `.node path { fill: … }`  
   - Second paint in `useLayoutEffect`

3. **No races**  
   - Keep a **single serialized render queue** (one Mermaid site config mutation at a time).  
   - One `initialize` immediately before its matching `render`.  
   - One cancellation token per `MermaidView` effect; never paint after cancel.  
   - No parallel `initialize` from two charts without the queue.

4. **Prove with node-body pixels**, not fillAttr-only or background samples.

---

## 1. Rendering sequence (target architecture)

### 1.1 Target app pipeline (single pass)

```
MermaidView effect (source | theme | studioDark)
  │
  ├─ cancel previous generation (flag only; in-flight work must not setState)
  │
  └─ enqueue on renderChain:
       1. mermaid.initialize(options)     // exactly once for this job
       2. source' = prepareSource(source) // optional classDef default ONLY if flowchart
       3. { svg } = await mermaid.render(uniqueId, source')
       4. measure svg (read-only: viewBox / bbox — no color mutation)
       5. if !cancelled: setMarkup(svg) + setNatural(size)
  │
  └─ React commit: dangerouslySetInnerHTML once
       // STOP. No second paint.
```

### 1.2 Mermaid pipeline (must stay upstream of any app UI)

```
initialize(siteConfig)
  theme + themeVariables (+ optional themeCSS only if proven necessary later)

render(id, text)
  parse → merge frontmatter/init directive
  theme resolve (mainBkg, nodeBorder, primaryTextColor, …)
  inject <style id-scoped> from getStyles(...)
  draw shapes:
    rough/classic fill := classDef fill || themeVariables.mainBkg
    stroke             := classDef stroke || themeVariables.nodeBorder
  return svg string
```

**Invariant:** When step 3 returns, SVG string must already contain the final colors. App only mounts and scales.

### 1.3 Competing stylesheets (after cleanup)

| Layer | Allowed? | Role |
|-------|----------|------|
| App `index.css` `.mermaid-host svg` | Yes | layout only (`display`, transparent bg) |
| App Tailwind / panel `#12141a` | Yes | chrome around the SVG, not node fill |
| Mermaid SVG `<style #id …>` | Yes | **sole** stylesheet for node/edge/label colors |
| Path presentation `fill` | Mermaid-owned | Must equal theme via draw (`mainBkg` / classDef) |
| classDef inline `style` on node | Yes if in source | Mermaid-native; applied **during** draw |
| App post-render paint / host fill rules | **No** | Overrides — out of scope |

---

## 2. Why prior approaches failed (planning constraints)

| Approach | Failure mode | Plan response |
|----------|--------------|----------------|
| themeVariables only | CSS updated; screenshots still light bodies | Verify `mainBkg` at draw; prefer **classDef default in source** so `userNodeOverrides` gets `stylesMap.fill` |
| themeCSS + !important | Competes with Mermaid sheet; override-like | Do not use for v1 of this plan |
| Post-render paint ×2–3 | Races, false PASS, still white in user shots | **Delete** paint path |
| `#18181b` on `#12141a` | Even correct dark fill nearly invisible | **Contrast budget** for palette (§3) |
| PASS via canvas (w/2, y=40) + bg prefill | Sampled pane, not node | Honest visual gate (§6) |

---

## 3. Palette (instruction that can succeed visually)

Do **not** use node fill ≈ pane background.

| Token | Recommended | Rationale |
|-------|-------------|-----------|
| Pane (Process) | keep `#12141a` | Existing panel |
| Node fill | `#27272a` (zinc-800) or `#3f3f46` (zinc-700) | Elevated vs pane; still “dark,” not lavender/white |
| Node stroke | `#52525b` / `#71717a` | Visible edge on dark pane |
| Node text | `#e4e4e7` or `#f4f4f5` | Light type on dark fill |
| Edge | `#71717a` | Muted, visible |
| Edge label bg | `#27272a` | Chip on dark pane |

Document final tokens in `STUDIO_DARK` once locked by a **passing** node-body screenshot.

**Mapping UI Theme → Mermaid:**

| UI Theme | Mermaid instruction |
|----------|---------------------|
| Dark | Studio palette via `theme: 'base'` + `themeVariables` (+ flowchart `classDef default` in prepared source) |
| Default / Base / Neutral (in-app dark shell) | Same as Dark (studio) so shell stays coherent |
| Forest | `theme: 'forest'`, no studio classDef, no dark variables |

---

## 4. Implementation phases

### Phase A — Stop the bleeding (cleanup, no behavior claims)

**A1. Remove overrides**

- Delete or hard-disable:
  - `paintStudioDarkRoot`, `applyStudioDarkSvg`, author-paint reapplication after render  
  - `useLayoutEffect` second paint in `MermaidView`  
  - `themeCSS: studioThemeCss()` unless Phase C proves it is required **and** is the only Mermaid channel (prefer not)
- `MermaidView` measure path: **read-only** (viewBox / size only).

**A2. Single write of SVG**

- `renderMermaidSvg` returns Mermaid’s `svg` string unchanged (except measurement attributes width/height if needed for layout).
- One `setMarkup` per successful job.

**A3. Keep serialization**

- Retain `renderChain` so two charts never interleave `initialize`/`render`.

**Exit criteria:** Code path has **one** color authority: Mermaid output. No DOM color mutation after `render`.

---

### Phase B — Single Mermaid instruction path (no race)

**B1. `mermaidInitOptions(studioDark)`**

For studio dark:

```ts
{
  startOnLoad: false,
  securityLevel: 'loose',  // avoid purify stripping style if needed
  theme: 'base',
  themeVariables: { ...MERMAID_DARK_THEME_VARIABLES }, // locked palette §3
  // no themeCSS in v1
  htmlLabels: false,
  flowchart: { htmlLabels: false, curve: 'basis', useMaxWidth: false, … }
}
```

**B2. Prepare source before render (diagram language only)**

For flowchart/graph when studio dark and source has **no** `classDef default`:

```text
classDef default fill:#27272a,stroke:#71717a,color:#e4e4e7
```

(use final §3 tokens)

Rationale (Mermaid core): `userNodeOverrides` uses `stylesMap.get("fill") || mainBkg`. classDef populates `stylesMap` **before** rough draws — this is **instruction**, not post-override.

Do **not** inject if author already defined `classDef default`.

**B3. Initialize immediately before render**

```ts
mermaid.initialize(opts)
const { svg } = await mermaid.render(id, preparedSource)
```

No delayed re-init. No shared “last theme” without re-init when theme changes.

**B4. Stable unique svg ids**

- Keep per-render unique id (`mmd-${reactId}-${n}`) to avoid `#id` CSS collisions between two mounted charts.
- Still serialize renders so global config is consistent.

**Exit criteria:**  
Probe (devtools or test): after `render`, **first solid node shape**:

- presentation or computed fill is studio node fill (not `#ECECFF`, not `#ffffff`)  
- text fill is light grey  

Without any app paint.

---

### Phase C — If Phase B still yields `#ECECFF` presentation fills

Stay inside SDK; escalate in order:

| Step | Action |
|------|--------|
| C1 | Log `mermaid.mermaidAPI.getConfig().themeVariables.mainBkg` **after** initialize and **before** render; assert equals studio fill |
| C2 | Put the same config in diagram **frontmatter** (`---\nconfig:\n  theme: base\n  themeVariables: …\n---`) so config is bound to the document Mermaid parses |
| C3 | Try UI Dark → Mermaid built-in `theme: 'dark'` only (accept Mermaid dark palette as interim “instruction met” for structure), then re-apply zinc via base+variables once B works |
| C4 | Check Mermaid changelog / newer than 11.16.0 for flowchart theming fixes; upgrade if relevant |
| C5 | File upstream issue with minimal repro (base+themeVariables, fillAttr still `#ECECFF`) — product still ships C1–C3 workarounds only if they are **pre-render instructions** |

**Still forbidden:** post-render fill rewriting.

---

### Phase D — App integration polish

**D1. `MermaidView`**

- Props unchanged: `source`, `theme`, `forceDark`, `scale`, `onRendered`.  
- Effect deps: `source`, `theme`, `studioDark` only (not unstable random deps beyond id seed).  
- Cancel flag: ignore results if effect cleaned up.

**D2. Process panel / canvas**

- Keep `forceDark={theme !== 'forest'}`.  
- Preview pane stays `#12141a`.  
- Default theme for new charts: `dark`.

**D3. Export**

- Keep `forceDark={false}` (or explicit forest/default) for print so PDF is not forced studio-dark unless product asks.

**D4. Templates**

- Optional: ship flowchart template **with** `classDef default` already in the starter so source is self-describing even outside the app.

---

## 5. Race-condition checklist

| Risk | Mitigation |
|------|------------|
| Two `initialize` interleaved | Global `renderChain` promise queue |
| Stale `setMarkup` after fast typing | `cancelled` flag in effect cleanup |
| Double paint after commit | Removed (`useLayoutEffect` paint gone) |
| SVG id CSS leak (`#d1` vs `#d2`) | Unique id per render; never reuse concurrent ids |
| Measure mutates colors | Measure read-only |
| React Strict Mode double mount | Cancel flag + queue; second mount supersedes |

---

## 6. Verification plan (no false PASS)

### 6.1 Automated

1. Unit: `mermaidInitOptions` exposes expected `theme` / `themeVariables` / no `themeCSS` (v1).  
2. Unit: `prepareSource` injects `classDef default` once for flowcharts.  
3. Integration (Playwright or vitest + happy-dom if SVG draw works):  
   - `initialize` + `render`  
   - Query solid shapes with `getBBox().width > 8`  
   - Assert fill is **not** in pale set (`#ECECFF`, `#fff`, high luma)  
   - Prefer raster sample at **shape center in viewBox coordinates** (no canvas prefill with pane color).

### 6.2 Manual gate (required)

- Hard-refresh Process panel, Theme **Dark**, default flowchart template.  
- Screenshot must show **dark elevated nodes** + **light labels** on `#12141a`.  
- Side-by-side optional: Forest still light/green.  
- **Do not** mark done if only JSON fillAttr is dark.

### 6.3 mermaid-test.html

- Either delete misleading PASS UI or implement §6.1 node-body sampling only.  
- Default status: **no PASS text** unless body samples pass.

---

## 7. File-level change list

| File | Change |
|------|--------|
| `src/lib/mermaidTheme.ts` | Remove paint/applyStudioDarkSvg/themeCSS v1; keep init + prepareSource + render queue; lock palette §3 |
| `src/components/math/MermaidView.tsx` | Single render path; remove layout paint; read-only measure |
| `src/lib/mermaidTheme.test.ts` | Match new API; no paint tests as success path |
| `public/mermaid-test.html` | Honest checks or slim demo without false PASS |
| `docs/mermaid-process-chart-theming.md` | Already documents history |
| This plan | Living doc; update when Phase C choices land |

---

## 8. Out of scope

- SCSS migration  
- Host Tailwind coloring of `.node path`  
- Post-render MutationObserver / rAF paint loops  
- Changing non-flowchart diagram kinds beyond shared `themeVariables`  
- Pixel-perfect match to Mermaid GitHub **default** demo (that look is the **failure** mode for Dark UI)

---

## 9. Definition of done

1. No post-render color mutation in app code.  
2. Theme **Dark** Process preview: node **bodies** dark (elevated zinc), labels light, edges muted — confirmed by **screenshot**.  
3. Theme **Forest** still uses Mermaid forest without studio classDef.  
4. No green PASS on test harness unless node-body samples pass.  
5. Render queue + cancel flag: no documented race in concurrent preview + canvas card.

---

## 10. Suggested implementation order

1. Phase A cleanup (remove overrides)  
2. Phase B instruction path (variables + classDef default in source)  
3. Phase §6 probe script (fail closed)  
4. Manual Process screenshot gate  
5. Phase C only if B fails closed probe  
6. Docs update with final tokens and any frontmatter decision  

**Owner note:** Prefer a short PR for A+B only; do not mix reintroducing paint with “no overrides.”
