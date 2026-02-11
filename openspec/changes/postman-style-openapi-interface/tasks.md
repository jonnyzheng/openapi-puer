## 1. Project Setup

- [x] 1.1 Add dependencies to package.json: `@apidevtools/swagger-parser`, `axios`, `@vscode/webview-ui-toolkit`
- [x] 1.2 Create directory structure: `src/providers/`, `src/panels/`, `src/services/`, `src/models/`, `src/webview/`
- [x] 1.3 Create TypeScript interfaces in `src/models/types.ts` for OpenAPI endpoints, parameters, and responses
- [x] 1.4 Add extension configuration schema to package.json for `openapi-puer.apiDirectory` setting

## 2. OpenAPI Parser Service

- [x] 2.1 Create `src/services/OpenApiService.ts` with class structure
- [x] 2.2 Implement `parseFile()` method to parse single OpenAPI JSON file using swagger-parser
- [x] 2.3 Implement `scanDirectory()` method to find and parse all OpenAPI files in configured directory
- [x] 2.4 Implement `extractEndpoints()` method to extract path, method, parameters, and schemas from parsed spec
- [x] 2.5 Add error handling for malformed JSON and invalid OpenAPI files
- [x] 2.6 Implement caching to avoid re-parsing unchanged files

## 3. Directory Configuration

- [x] 3.1 Register `openapi-puer.apiDirectory` configuration in package.json contributes.configuration
- [x] 3.2 Create configuration reader utility to get and validate the API directory path
- [x] 3.3 Implement directory validation with error notification for invalid paths
- [x] 3.4 Set up FileSystemWatcher to monitor configured directory for changes
- [x] 3.5 Handle file add/modify/delete events to update parsed specs

## 4. Tree View Provider

- [x] 4.1 Create `src/providers/ApiTreeProvider.ts` implementing `TreeDataProvider`
- [x] 4.2 Define tree item types: ApiFileItem, EndpointItem, TagGroupItem
- [x] 4.3 Implement `getChildren()` to return file nodes at root level
- [x] 4.4 Implement `getChildren()` to return endpoint nodes under file nodes
- [x] 4.5 Add HTTP method icons/colors for endpoint items (GET=green, POST=yellow, etc.)
- [x] 4.6 Register tree view in package.json contributes.views with activity bar icon
- [x] 4.7 Implement refresh functionality with command and toolbar button
- [x] 4.8 Add "Group by Tags" toggle option

## 5. Webview Panel Infrastructure

- [x] 5.1 Create `src/panels/ApiPanel.ts` for webview panel management
- [x] 5.2 Implement `createOrShow()` method to create/reveal the webview panel
- [x] 5.3 Set up message passing between extension and webview (postMessage/onDidReceiveMessage)
- [x] 5.4 Create `src/webview/index.html` base template with VS Code webview toolkit
- [x] 5.5 Create `src/webview/styles.css` with base styling matching VS Code theme
- [x] 5.6 Create `src/webview/main.js` with message handling and DOM manipulation utilities

## 6. API Detail View

- [x] 6.1 Implement endpoint metadata section in webview (summary, description, operationId, tags)
- [x] 6.2 Implement parameters table showing name, location, type, required, description
- [x] 6.3 Implement request body schema display with JSON structure visualization
- [x] 6.4 Implement responses section with status code tabs and schema display
- [x] 6.5 Add collapsible sections for Parameters, Request Body, and Responses
- [x] 6.6 Wire tree view selection to open endpoint in webview panel

## 7. Request Builder

- [x] 7.1 Add base URL input field with server URL from spec as default
- [x] 7.2 Implement path parameter input fields with validation
- [x] 7.3 Implement query parameters table with enable/disable checkboxes
- [x] 7.4 Implement headers table with enable/disable checkboxes
- [x] 7.5 Implement request body editor with JSON syntax highlighting
- [x] 7.6 Add content-type selector dropdown for request body
- [x] 7.7 Implement "Generate from Schema" button to create sample request body
- [x] 7.8 Add environment variable syntax highlighting for `{{variable}}` references

## 8. HTTP Request Executor

- [x] 8.1 Create `src/services/HttpService.ts` with axios configuration
- [x] 8.2 Implement `sendRequest()` method to construct and send HTTP request
- [x] 8.3 Implement URL building with path parameter substitution and query string
- [x] 8.4 Implement environment variable substitution before sending
- [x] 8.5 Add request timeout handling (default 30 seconds)
- [x] 8.6 Implement request cancellation with AbortController
- [x] 8.7 Add Send button with Ctrl+Enter keyboard shortcut
- [x] 8.8 Show loading indicator and elapsed time during request

## 9. Response Viewer

- [x] 9.1 Implement response status display with color-coded status code
- [x] 9.2 Display response time and body size
- [x] 9.3 Implement Headers tab showing response headers
- [x] 9.4 Implement Body tab with syntax highlighting for JSON/XML/HTML
- [x] 9.5 Add pretty-print toggle for JSON responses
- [x] 9.6 Add word wrap toggle and line numbers
- [x] 9.7 Implement search functionality (Ctrl+F) with match highlighting
- [x] 9.8 Add Copy button and "Copy as cURL" functionality
- [x] 9.9 Implement Save Response to file

## 10. Environment Manager

- [x] 10.1 Create `src/services/EnvironmentService.ts` for environment management
- [x] 10.2 Implement environment storage in `.openapi-puer/environments.json`
- [x] 10.3 Implement CRUD operations for environments (create, read, update, delete)
- [x] 10.4 Implement variable storage with key, value, description fields
- [x] 10.5 Add environment selector dropdown in webview header
- [x] 10.6 Persist active environment selection in workspace state
- [x] 10.7 Implement secret variable storage using VS Code SecretStorage API
- [x] 10.8 Create environment editor UI for managing variables
- [x] 10.9 Implement import/export functionality for environments

## 11. Extension Integration

- [x] 11.1 Update `src/extension.ts` to register all commands
- [x] 11.2 Register tree view provider on activation
- [x] 11.3 Initialize services (OpenApiService, EnvironmentService) on activation
- [x] 11.4 Add commands: OpenAPI Puer.refresh, OpenAPI Puer.createEnvironment, OpenAPI Puer.editEnvironment
- [x] 11.5 Add status bar item showing active environment
- [x] 11.6 Implement proper disposal of watchers and webviews on deactivation

## 12. Testing and Polish

- [x] 12.1 Create sample OpenAPI files for testing (2.0, 3.0, 3.1 versions)
- [x] 12.2 Test with real-world OpenAPI specs (Petstore, GitHub API, etc.)
- [x] 12.3 Add error handling and user-friendly error messages throughout
- [x] 12.4 Ensure proper theming support (light/dark/high contrast)
- [x] 12.5 Update package.json metadata (description, keywords, icon)
- [x] 12.6 Write README with usage instructions and screenshots
