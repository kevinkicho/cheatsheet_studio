#!/usr/bin/env node
/**
 * CLI entry for monorepo (tsx) and published package (dist/cli.js).
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const distCli = path.join(here, '..', 'dist', 'cli.js')
const srcCli = path.join(here, '..', 'src', 'cli.ts')
const args = process.argv.slice(2)

if (existsSync(distCli)) {
  const r = spawnSync(process.execPath, [distCli, ...args], {
    stdio: 'inherit',
  })
  process.exit(r.status ?? 1)
}

// Dev: run TypeScript via tsx
const r = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['tsx', srcCli, ...args],
  { stdio: 'inherit', shell: process.platform === 'win32' },
)
process.exit(r.status ?? 1)
