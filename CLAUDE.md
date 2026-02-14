# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenAPI Puer is a VS Code extension built with TypeScript. It provides a GUI interface for OpenAPI specification files, allowing users to visualize and edit api items within GUI.

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


## coding

- Use TypeScript for all source code.
- Follow VS Code extension development best practices.
- Use the same ui design for webview as the one in the current version of OpenAPI Puer.
- Keep the code modular and maintainable, with clear separation of concerns between different services and components.
- Write unit tests for critical services and integration tests for the extension as a whole.
- keep the same behavior of the edit,delete, add operations for api items in the GUI of OpenAPI Puer.
- use tailwindcss for styling the webview components, and follow the existing design patterns in the current version of OpenAPI Puer.

## UI Rules

- When an inline edit input replaces a text label in a table cell, the input height must match the original text label height. Use consistent `height`, `line-height`, `padding`, and `box-sizing` between `.editable-cell` and its `.inline-edit-input` so there is no layout shift on focus.
- MUST use custom confirmation dialog , don't use the default browser `confirm()` function.