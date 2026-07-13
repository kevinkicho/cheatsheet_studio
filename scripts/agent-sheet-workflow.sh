#!/usr/bin/env bash
# Example agent workflow: pack → validate → (optional) ready for Import JSON
# Usage: bash scripts/agent-sheet-workflow.sh [packId] [outDir]
set -euo pipefail
PACK="${1:-calc-derivatives}"
OUT="${2:-examples/agent-out}"
mkdir -p "$OUT"
echo "== doctor =="
npm run cheatsheet -- doctor
echo "== compose pack: $PACK =="
npm run cheatsheet -- pack "$PACK" -o "$OUT/${PACK}.sheet.json"
echo "== validate =="
npm run cheatsheet -- validate "$OUT/${PACK}.sheet.json"
npm run cheatsheet -- summarize "$OUT/${PACK}.sheet.json" --verbose
echo ""
echo "Done. Import in Studio: My Sheets / Workspace → Import JSON"
echo "  file: $OUT/${PACK}.sheet.json"
