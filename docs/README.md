# Documentation

| Doc | Description |
|-----|-------------|
| [process-charts.md](./process-charts.md) | Process tool: pipe editor (snap/shafts/labels), explicit Edit mode, `processFlow` fidelity, mind maps, cloud library |
| [vector-graphics.md](./vector-graphics.md) | Equations (KaTeX), figures (SVG), process charts, and **Studio SVG export** (diagram embeds, fonts, paint flags) |
| [agent-sdk.md](./agent-sdk.md) | Headless SDK + CLI for agents (`packages/cheatsheet-sdk`) — does not change the web UI; **grid layout philosophy** |
| [flagship.md](./flagship.md) | Canonical path: agent midterm pack → Import JSON → Export PDF/SVG |

Product overview, setup, testing, and deploy steps live in the root
[README.md](../README.md).

## Quick pointers

- **Auto-layout** — Studio packs by folder/heading on a 24px grid; see root README *Canvas & tools* and [agent-sdk.md](./agent-sdk.md#layout-philosophy-grid-pack).
- **SVG export** — Process diagrams are rasterized/embedded for `file://`; equations stay natural size. Details: [vector-graphics.md](./vector-graphics.md#studio-svg-export).
- **Favorites** — Library ♥ only (not Item Properties).
