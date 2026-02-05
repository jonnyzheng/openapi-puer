## Why

VS Code lacks a native, integrated API development and testing tool. Developers currently switch between VS Code and external tools like Postman or Apifox to test APIs defined in their OpenAPI specification files. This extension brings API visualization, editing, and debugging directly into VS Code, streamlining the API development workflow.

## What Changes

- Add configuration setting to specify an API documents directory within a project
- Implement a sidebar panel with directory tree view showing OpenAPI JSON files
- Create a webview-based main interface with:
  - API endpoint information display (method, path, parameters, request/response schemas)
  - Request builder with parameter inputs, headers, and body editor
  - Response viewer with syntax highlighting and formatting
  - Environment/variable management for different API contexts
- Parse and validate OpenAPI 2.0 (Swagger), 3.0, and 3.1 specification files
- Support sending HTTP requests directly from the extension

## Capabilities

### New Capabilities

- `api-directory-config`: Configuration system for setting and managing the API documents directory path
- `openapi-parser`: Parser for reading and validating OpenAPI 2.0/3.0/3.1 JSON specification files
- `directory-tree-panel`: Sidebar panel displaying hierarchical view of API files and endpoints
- `api-detail-view`: Main webview interface showing endpoint details, parameters, and schemas
- `request-builder`: Interface for constructing and customizing HTTP requests with headers, params, and body
- `request-executor`: HTTP client for sending requests and capturing responses
- `response-viewer`: Formatted display of API responses with syntax highlighting
- `environment-manager`: System for managing variables and environment configurations

### Modified Capabilities

<!-- No existing capabilities to modify - this is a new extension -->

## Impact

- **Extension Entry Point**: `src/extension.ts` will register new commands, views, and configuration
- **Package Configuration**: `package.json` needs new contributes entries for views, commands, and settings
- **Dependencies**: Will require OpenAPI parsing library (e.g., `@apidevtools/swagger-parser`) and HTTP client
- **Webview Resources**: New HTML/CSS/JS assets for the main interface panel
- **VS Code API**: Uses TreeView API for sidebar, Webview API for main panel, Configuration API for settings
