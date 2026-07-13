// @ts-nocheck — Vitest may nest a different Vite version than the app.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

/**
 * Standalone Vitest config (not typechecked by `tsc -b`).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'packages/cheatsheet-sdk/src/**/*.{test,spec}.{ts,tsx}',
    ],
    globals: false,
    css: false,
  },
})
