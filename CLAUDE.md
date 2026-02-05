# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SuperAPI is a VS Code extension built with TypeScript. It provides a GUI interface for OpenAPI specification files, allowing users to visualize and edit api items within GUI.

## Commands

```bash
pnpm install          # Install dependencies
pnpm run compile      # Compile TypeScript
pnpm run watch        # Watch mode (auto-recompile)
pnpm run lint         # Lint
pnpm run test         # Run tests
pnpm dlx vsce package # Package as .vsix
```

## Architecture

- **Entry Point**: `src/extension.ts` - exports `activate()` and `deactivate()` functions
- **Commands**: Registered in `package.json` under `contributes.commands`, implemented in `activate()`
- **Activation Events**: Defined in `package.json` under `activationEvents`
- **Output**: Compiled JS goes to `out/` directory

## Debugging

Press `F5` in VS Code to launch the Extension Development Host.
