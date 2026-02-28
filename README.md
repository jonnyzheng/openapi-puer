# OpenAPI Puer

OpenAPI Puer is a Postman-style API development and testing tool for VS Code. It lets you browse OpenAPI specs, send requests, and manage environments without leaving your editor.

## Features

- API Explorer tree for OpenAPI files and endpoints
- Request builder with params, headers, cookies, and body editing
- Response viewer with syntax highlighting
- Environment management with variable substitution
- Server management for OpenAPI 3.x servers
- Schema viewer for components and schema-only files

## Quick Start

1. Install the extension in VS Code
2. Open a workspace
3. The OpenAPI Puer sidebar shows a welcome screen with a **Select API Folder** button
4. Click it to choose a folder for your API documentation
5. If the folder is empty or missing the expected structure, the extension offers to scaffold it automatically
6. Once configured, expand the API Explorer and click an endpoint to open the request panel

You can also run **OpenAPI Puer: Setup API Folder** from the command palette at any time.

## OpenAPI Files

- JSON format only
- Supports OpenAPI 2.0, 3.0, and 3.1
- Schema-only JSON files are supported if they contain components.schemas

## First-Time Setup

When no API folder is configured, the sidebar displays an onboarding view:

- **Welcome to OpenAPI Puer** message with a description
- **Select API Folder** button that opens a folder picker

After selecting a folder, the extension validates its structure. If the folder lacks the expected layout (`.openapi-puer/`, `components/`, `paths/`, `api.json`), you are prompted to scaffold it. Scaffolding creates all required directories, default configuration files, and a README.md — without overwriting any existing files.

## Configuration

Set the API directory in VS Code settings:

- openapi-puer.apiDirectory: Path to the folder containing OpenAPI JSON files

You can also set it from the API Explorer title bar using Set API Folder, or use the **Setup API Folder** command for the full onboarding flow with automatic scaffolding.

## Working With APIs

### Browse and Open

- Use the API Explorer view to navigate folders and OpenAPI files
- Click an endpoint to open the request panel
- Use Open in New Tab from the context menu to keep multiple panels open

### Create and Edit

- Add Folder to create a new folder under the API directory
- Add File to create a new OpenAPI JSON file
- Add Endpoint to add a path and method to a file
- Add Schema to manage components schemas
- Add Server to manage OpenAPI 3.x servers
- View Source Code to open the raw JSON file

### Send Requests

- Select a server or enter a base URL
- Fill in path params, query params, headers, cookies, and body
- Click Send to execute the request
- Review response status, headers, and body in the response tab

## Environments

OpenAPI Puer lets you create environments and variables that can be used in request fields.

### Manage Environments

- Click the status bar globe icon to select an active environment
- Use the command palette to create or edit environments
- Variables can be marked as secret and are stored in VS Code secret storage

### Variable Substitution

Use double curly braces to reference environment variables:

- Base URL: https://{{host}}
- Headers: Authorization: Bearer {{token}}

If a variable is not found, the original placeholder is kept.

## Development

### Setup

```bash
pnpm install
```

### Build

```bash
pnpm run compile
```

### Watch Mode

```bash
pnpm run watch
```

### Run Extension

Press F5 in VS Code to open a new Extension Development Host window.

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

This creates a .vsix file that can be installed in VS Code.
