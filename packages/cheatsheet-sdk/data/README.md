# Content data

## Mastersheet (generation tracker)

| File | Purpose |
|------|---------|
| `content-mastersheet.xlsx` | Human tracker: inventory, matrix, generate plan, dups |
| `content-inventory.json` | Machine-readable same inventory for generators/CLI |

**Regenerate after catalog or everything-sheet changes:**

```bash
python scripts/build-content-mastersheet.py
```

Sources:

- `seed-catalog.json` — library catalog
- `examples/agent-out/everything.sheet.json` — kitchen-sink sheet
- `topic-packs/*` — premade packs

See workbook **Overview** sheet for how to avoid duplicate generation.
