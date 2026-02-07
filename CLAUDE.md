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

## Source Structure

```
src/
├── extension.ts                  # Extension entry point (activate/deactivate)
├── models/
│   └── types.ts                  # Type definitions
├── panels/
│   └── ApiPanel.ts               # Webview panel for API visualization
├── providers/
│   └── ApiTreeProvider.ts        # Tree view data provider
├── services/
│   ├── ConfigService.ts          # Configuration management
│   ├── EnvironmentService.ts     # Environment handling
│   ├── HttpService.ts            # HTTP request execution
│   └── OpenApiService.ts         # OpenAPI spec parsing and management
├── test/
│   ├── extension.test.ts         # Extension integration tests
│   └── OpenApiService.test.ts    # OpenApiService unit tests
└── webview/
    ├── componentsTab.js          # Components tab UI
    ├── detailsTab.js             # Details tab UI
    ├── main.js                   # Webview frontend logic
    ├── requestTab.js             # Request tab UI
    ├── serversTab.js             # Servers tab UI
    ├── styles.css                # Webview styles
    └── utils.js                  # Shared webview utilities
```

## Debugging

Press `F5` in VS Code to launch the Extension Development Host.
