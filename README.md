# SuperAPI

A VS Code extension for SuperAPI.

## Features

- Hello World command

## Requirements

- VS Code 1.85.0 or higher
- Node.js 20.x or higher
- pnpm 9.x or higher

## Development

### Setup

```bash
pnpm install
```

### Build

```bash
pnpm run compile
```

### Watch mode

```bash
pnpm run watch
```

### Run Extension

Press `F5` in VS Code to open a new Extension Development Host window.

### Lint

```bash
pnpm run lint
```

### Test

```bash
pnpm run test
```

## Packaging

```bash
pnpm dlx vsce package
```

This will create a `.vsix` file that can be installed in VS Code.
