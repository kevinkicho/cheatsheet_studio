# Publishing `@cheatsheet-studio/sdk`

The React app does **not** depend on the published package. Publishing is optional for external agents/CI.

## Prerequisites

1. npm account with permission to publish under `@cheatsheet-studio` (or change the package name in `package.json`).
2. Logged in: `npm login`
3. From monorepo root.

## Steps

```bash
# Snapshot seed catalog + compile TypeScript
npm run sdk:build

# Inspect tarball (no upload)
cd packages/cheatsheet-sdk
npm pack --dry-run

# Publish
npm publish --access public
```

Or from root after build:

```bash
npm run sdk:pack          # dry-run pack
# then: cd packages/cheatsheet-sdk && npm publish --access public
```

## Version

Bump `packages/cheatsheet-sdk/package.json` `version` and update `CHANGELOG.md` before publish.

## After publish

```bash
npm install @cheatsheet-studio/sdk
npx cheatsheet doctor
npx cheatsheet pack calc-derivatives -o sheet.json
```

## Notes

- `firebase-admin` and `playwright` are optional peers for push/pull and PDF.
- PDF: `npx playwright install chromium` on the machine that runs `export-pdf`.
- Never put service account JSON in the package or npm registry.
