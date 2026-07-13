# Example agent workflow (Windows): pack → validate
# Usage: pwsh scripts/agent-sheet-workflow.ps1 [packId] [outDir]
param(
  [string]$Pack = "calc-derivatives",
  [string]$OutDir = "examples/agent-out"
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
Write-Host "== doctor =="
npm run cheatsheet -- doctor
Write-Host "== compose pack: $Pack =="
$out = Join-Path $OutDir "$Pack.sheet.json"
npm run cheatsheet -- pack $Pack -o $out
Write-Host "== validate =="
npm run cheatsheet -- validate $out
npm run cheatsheet -- summarize $out --verbose
Write-Host ""
Write-Host "Done. Import in Studio: Import JSON → $out"
