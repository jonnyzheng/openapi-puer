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
2. Open a workspace that contains OpenAPI JSON files
3. In the OpenAPI Puer activity bar, click Set API Folder
4. Select the directory that contains your OpenAPI JSON files
5. Expand the API Explorer and click an endpoint to open the request panel

## OpenAPI Files

- JSON format only
- Supports OpenAPI 2.0, 3.0, and 3.1
- Schema-only JSON files are supported if they contain components.schemas

## Configuration

Set the API directory in VS Code settings:

- openapi-puer.apiDirectory: Path to the folder containing OpenAPI JSON files

You can also set it from the API Explorer title bar using Set API Folder.

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
