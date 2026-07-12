# Mermaid theme trials — screenshot record

Generated: **2026-07-12T01:05:14.168Z**  
Mermaid: **11.16.0**  
Method: Playwright render → screenshot `#host` → sample PNG pixels (grid + center column).  
**No post-render paint.**

## Criteria

| Term | Definition |
|------|------------|
| Pale | luma &gt; 0.55 (white / lavender) |
| Dark | 0.02 &lt; luma &lt; 0.4 (elevated dark zinc range) |
| Control OK | sees pale/lavender in chart |
| Trial OK | enough dark body pixels, white/lavender not dominant |

## Results table

| ID | Label | Result | pale | dark | white | lav | cfg theme / mainBkg | Screenshots |
|----|-------|--------|------|------|-------|-----|---------------------|-------------|
| `1-default-control` | CONTROL: theme default (expect pale) | **OK** | 9 | 50 | 6 | 7 | `default` / `#ECECFF` | [full](1-default-control.png) · [host](1-default-control-host.png) |
| `2-builtin-dark` | TRY1: theme dark only | **OK** | 2 | 58 | 0 | 0 | `dark` / `#1f2020` | [full](2-builtin-dark.png) · [host](2-builtin-dark-host.png) |
| `3-base-variables` | TRY2a: theme base + themeVariables | **OK** | 1 | 59 | 0 | 0 | `base` / `#27272a` | [full](3-base-variables.png) · [host](3-base-variables-host.png) |
| `4-frontmatter` | TRY2b: frontmatter base + themeVariables | **OK** | 2 | 58 | 0 | 1 | `default` / `#ECECFF` | [full](4-frontmatter.png) · [host](4-frontmatter-host.png) |
| `5-classdef` | TRY3: classDef default + base + vars | **OK** | 1 | 59 | 0 | 0 | `base` / `#27272a` | [full](5-classdef.png) · [host](5-classdef-host.png) |
| `6-frontmatter-classdef` | TRY4: frontmatter + classDef | **OK** | 2 | 58 | 0 | 1 | `default` / `#ECECFF` | [full](6-frontmatter-classdef.png) · [host](6-frontmatter-classdef-host.png) |

## Winners

1. **`2-builtin-dark`** — TRY1: theme dark only
1. **`3-base-variables`** — TRY2a: theme base + themeVariables
1. **`4-frontmatter`** — TRY2b: frontmatter base + themeVariables
1. **`5-classdef`** — TRY3: classDef default + base + vars
1. **`6-frontmatter-classdef`** — TRY4: frontmatter + classDef

## Recommendation

| Priority | Trial | Use when |
|----------|--------|----------|
| **1 (Studio zinc)** | `3-base-variables` | Official docs: `theme: 'base'` + `themeVariables`. Host PNG: fill `#27272a`, dark nodes. |
| **2 (simplest dark)** | `2-builtin-dark` | Built-in `theme: 'dark'` (`#1f2020`). Host PNG: dark charcoal nodes. |
| Optional | `5-classdef` | Also OK (same as base+vars + classDef). |

**App path (updated):** `src/lib/mermaidTheme.ts` combines the working trials:

1. `initialize({ theme: 'base', themeVariables })` (trial 3)
2. Diagram **frontmatter** with the same variables (trial 4)
3. Flowchart **`classDef default`** (trial 5)
4. `htmlLabels: false` (SVG text, not white HTML chips)

Hard-refresh Process after rebuild. Re-check with a new Process preview screenshot.

## Visual review of host screenshots

| File | Visual |
|------|--------|
| `1-default-control-host.png` | Pale lavender nodes, dark text — **fails Dark UI** |
| `2-builtin-dark-host.png` | Dark charcoal fills — **works** |
| `3-base-variables-host.png` | Dark zinc fills `#27272a` — **works** (official custom) |
| `5-classdef-host.png` | Same as base+variables — **works** |

**Conclusion:** Official SDK theming **does** darken node bodies in clean Playwright. Docs are not wrong; isolated screenshots prove it. Process-panel pale shots need the app on this initialize path + fresh bundle.

## Control

`1-default-control`: **OK (pale as expected)** pale=9 white=6

## Per-trial notes

### 1-default-control

- **Label:** CONTROL: theme default (expect pale)
- **Result:** OK
- **Config:** `{"theme":"default","mainBkg":"#ECECFF","primaryColor":"#ECECFF"}`
- **First fill attr / computed:** `{"fill":"#ECECFF","computed":"rgb(236, 236, 255)","tag":"path","cls":null}`
- **Grid:** pale=9 dark=50 white=6 lavender=7
- **Center column:** pale=3 dark=5
- **Screenshots:** ![host](1-default-control-host.png)

### 2-builtin-dark

- **Label:** TRY1: theme dark only
- **Result:** OK
- **Config:** `{"theme":"dark","mainBkg":"#1f2020","primaryColor":"#1f2020"}`
- **First fill attr / computed:** `{"fill":"#1f2020","computed":"rgb(31, 32, 32)","tag":"path","cls":null}`
- **Grid:** pale=2 dark=58 white=0 lavender=0
- **Center column:** pale=0 dark=8
- **Screenshots:** ![host](2-builtin-dark-host.png)

### 3-base-variables

- **Label:** TRY2a: theme base + themeVariables
- **Result:** OK
- **Config:** `{"theme":"base","mainBkg":"#27272a","primaryColor":"#27272a","darkMode":true}`
- **First fill attr / computed:** `{"fill":"#27272a","computed":"rgb(39, 39, 42)","tag":"path","cls":null}`
- **Grid:** pale=1 dark=59 white=0 lavender=0
- **Center column:** pale=1 dark=7
- **Screenshots:** ![host](3-base-variables-host.png)

### 4-frontmatter

- **Label:** TRY2b: frontmatter base + themeVariables
- **Result:** OK
- **Config:** `{"theme":"default","mainBkg":"#ECECFF","primaryColor":"#ECECFF"}`
- **First fill attr / computed:** `{"fill":"#27272a","computed":"rgb(39, 39, 42)","tag":"path","cls":null}`
- **Grid:** pale=2 dark=58 white=0 lavender=1
- **Center column:** pale=0 dark=8
- **Screenshots:** ![host](4-frontmatter-host.png)

### 5-classdef

- **Label:** TRY3: classDef default + base + vars
- **Result:** OK
- **Config:** `{"theme":"base","mainBkg":"#27272a","primaryColor":"#27272a","darkMode":true}`
- **First fill attr / computed:** `{"fill":"#27272a","computed":"rgb(39, 39, 42)","tag":"path","cls":null}`
- **Grid:** pale=1 dark=59 white=0 lavender=0
- **Center column:** pale=1 dark=7
- **Screenshots:** ![host](5-classdef-host.png)

### 6-frontmatter-classdef

- **Label:** TRY4: frontmatter + classDef
- **Result:** OK
- **Config:** `{"theme":"default","mainBkg":"#ECECFF","primaryColor":"#ECECFF"}`
- **First fill attr / computed:** `{"fill":"#27272a","computed":"rgb(39, 39, 42)","tag":"path","cls":null}`
- **Grid:** pale=2 dark=58 white=0 lavender=1
- **Center column:** pale=0 dark=8
- **Screenshots:** ![host](6-frontmatter-classdef-host.png)

