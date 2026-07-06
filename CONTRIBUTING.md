# Contributing

## Prerequisites

```bash
npm ci
```

Installs `@types/node` and `@types/vscode`, which clears IDE/TypeScript module-resolution errors for extension sources.

## Build and validate

Run before each commit:

```bash
npm run compile
npm run lint
npm run esbuild
npm test    # once the test harness is present
```

## Tests

Generator-focused tests run in plain Node (no live NSP required). Fixtures live under `test/fixtures/`:

- `nsp-<release>.json` — one JSON file per NSP release (mock API responses, device inventory, read-only leaf metadata).
- `corpus/` — curated `.igen`/`.ifxgen` inputs and golden generated intent-type outputs.

Capture an authentic fixture from a lab NSP (optional, never run in CI):

```bash
NSP_SERVER=<host> NSP_USER=<user> NSP_PASSWORD=<pass> npm run capture:nsp
```

Default device inventory follows the `clab-spain` lab (SR OS `1034::cafe:1/2`, SR Linux `1034::cafe:3/4/5`).
