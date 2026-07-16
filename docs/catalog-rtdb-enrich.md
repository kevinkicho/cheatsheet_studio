# Catalog bulk load (RTDB) + Ollama topic enrich

## Why

- **Firestore** one-doc-per-item is slow at boot when the library grows.
- **Realtime Database** stores one bulk snapshot (`catalog/v1`) so the app loads the whole catalog in a single read.
- **Ollama Cloud** (`gemma4:31b` via API; marketing name often ends in `-cloud`) can propose new cards for thin topics.

## Secrets

| Variable | Where | Notes |
|----------|--------|--------|
| `OLLAMA_API_KEY` | `.env` only (gitignored) | **Never** `VITE_` — Vite proxy injects Bearer for `/ollama-proxy` |
| `VITE_OLLAMA_MODEL` | `.env` | Default `gemma4:31b` |
| `VITE_FIREBASE_DATABASE_URL` | `.env` | e.g. `https://PROJECT-default-rtdb.firebaseio.com` |

## Firebase setup

1. Console → **Build → Realtime Database** → create DB (if needed).
2. Deploy rules: `firebase deploy --only database`
3. Rules file: `database.rules.json` — signed-in users can read/write `catalog/v1`.

## Boot sequence

After Google sign-in, `/app` shows **AppInitSplash** for **≥10 seconds**:

- Firebase config
- Auth session
- RTDB connectivity + catalog meta
- Bulk catalog load (RTDB → Firestore → seed)
- Firestore reachability
- Ollama proxy ping
- Bundled seed always OK

## UI

Left sidebar (no card/panel selected) → **Catalog & enrich**:

- Subject chips + **+ New** (AI subject pack: topics × cards/topic)
- Topic browser, card count slider (1–12), custom prompt
- Generate → review (select, modal, **feedback → regenerate**) → Accept & publish RTDB
- **Publish current catalog → RTDB**

### Floating AI chat (FAB)

Bottom-right chat bubble:

1. Type natural language (e.g. psychology pack with 12 cards each)
2. AI proposes an action with **Confirm & run**
3. Opens Catalog & enrich with proposals for review

### Example: psychology subject

**Option A — Catalog UI**

1. Catalog & enrich → **+ New**
2. Load psychology preset (or edit topics)
3. Set cards/topic = 12 → Generate → review → Accept & publish

**Option B — FAB chat**

> Produce psychology with clinical psychology, cognitive psychology, criminal psychology, social psychology, developmental psychology, neuropsychology each with 12 meaningful blocks

Confirm → wait → review modal → Accept & publish

## CLI

```bash
npm run catalog:list
npm run catalog:thin
npm run catalog:enrich -- --subject mathematics --topic Calculus
npm run catalog:enrich:thin
```

Writes `examples/agent-out/enriched-catalog.json`. Publish bulk from the signed-in UI.

## Load order (`libraryStore.load`)

1. RTDB `catalog/v1` (bulk JSON)
2. Firestore `libraryItems` collection
3. Bundled `SEED_LIBRARY`
