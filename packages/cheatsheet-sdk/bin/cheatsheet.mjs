#!/usr/bin/env node
/**
 * CLI entry — runs TypeScript via tsx (dev dependency of the monorepo root).
 * Does not start Vite or the React app.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const cli = path.join(here, '..', 'src', 'cli.ts')
const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['tsx', cli, ...process.argv.slice(2)],
  { stdio: 'inherit', shell: process.platform === 'win32' },
)
process.exit(result.status ?? 1)
