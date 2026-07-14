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
```
