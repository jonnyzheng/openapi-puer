## Context

SuperAPI is a VS Code extension (TypeScript, targeting VS Code 1.85+) currently in early development with minimal functionality. The goal is to transform it into a full-featured API development tool similar to Postman/Apifox, but integrated directly into VS Code.

The extension will use:
- **TreeView API** for the sidebar directory panel
- **Webview API** for the main interface (request builder, response viewer)
- **Configuration API** for user settings
- **FileSystem API** for watching and reading OpenAPI files

## Goals / Non-Goals

**Goals:**
- Provide a seamless API testing experience within VS Code
- Support OpenAPI 2.0 (Swagger), 3.0, and 3.1 specifications
- Enable quick navigation between API endpoints via sidebar tree
- Allow sending HTTP requests and viewing formatted responses
- Support environment variables for different contexts (dev, staging, prod)

**Non-Goals:**
- API specification editing/authoring (read-only for now)
- Mock server generation
- API documentation export
- Team collaboration features (sync, sharing)
- Support for non-OpenAPI formats (GraphQL, gRPC, SOAP)

## Decisions

### 1. Webview Framework: Vanilla HTML/CSS/JS vs React/Vue/Svelte

**Decision**: Use vanilla HTML/CSS/JS with VS Code's webview toolkit

**Rationale**:
- Reduces bundle size and complexity
- No build step required for webview assets
- VS Code provides `@vscode/webview-ui-toolkit` for consistent styling
- Simpler message passing between extension and webview

**Alternatives considered**:
- React: More familiar, but adds build complexity and bundle size
- Svelte: Lightweight, but adds tooling overhead for a relatively simple UI

### 2. OpenAPI Parser: Custom vs Library

**Decision**: Use `@apidevtools/swagger-parser`

**Rationale**:
- Battle-tested library with full OpenAPI 2.0/3.0/3.1 support
- Handles $ref resolution automatically
- Validates specs against OpenAPI schema
- Active maintenance and community support

**Alternatives considered**:
- Custom parser: Too much effort, error-prone for edge cases
- `openapi-types` + manual parsing: Types only, no validation

### 3. HTTP Client: Node's http/https vs Axios vs node-fetch

**Decision**: Use `axios`

**Rationale**:
- Works in Node.js environment (VS Code extension host)
- Simple API for all HTTP methods
- Built-in request/response interceptors for logging
- Handles timeouts, redirects, and error responses gracefully

**Alternatives considered**:
- Native `http`/`https`: Lower-level, more boilerplate
- `node-fetch`: Lighter, but less feature-rich for our needs

### 4. State Management: Extension Context vs File-based

**Decision**: Hybrid approach
- **Workspace state** (`workspaceState`): Current environment selection, recent requests
- **File-based** (`.superapi/` directory): Environment definitions, saved requests, request history

**Rationale**:
- Workspace state for ephemeral UI state
- File-based for user data that should persist and be version-controllable
- Users can commit `.superapi/environments.json` to share configs with team

**Alternatives considered**:
- Pure extension storage: Not portable, can't be version controlled
- Pure file-based: Slower for frequent UI state updates

### 5. Architecture: Monolithic vs Modular

**Decision**: Modular architecture with clear separation

```
src/
├── extension.ts           # Entry point, command registration
├── providers/
│   └── ApiTreeProvider.ts # TreeView data provider
├── panels/
│   └── ApiPanel.ts        # Webview panel management
├── services/
│   ├── OpenApiService.ts  # Parsing and validation
│   ├── HttpService.ts     # Request execution
│   └── EnvironmentService.ts # Variable management
├── models/
│   └── types.ts           # TypeScript interfaces
└── webview/
    ├── index.html
    ├── main.js
    └── styles.css
```

**Rationale**:
- Clear separation of concerns
- Easier to test individual components
- Follows VS Code extension best practices

## Risks / Trade-offs

**[Risk] Large OpenAPI files may cause performance issues**
→ Mitigation: Lazy-load endpoint details, cache parsed specs, show loading indicators

**[Risk] Webview communication overhead**
→ Mitigation: Batch messages, debounce frequent updates, use efficient serialization

**[Risk] CORS issues when sending requests from extension**
→ Mitigation: Requests run in Node.js context (extension host), not browser—CORS doesn't apply

**[Risk] Environment variables may contain secrets**
→ Mitigation: Store sensitive values in VS Code's `SecretStorage` API, warn users about committing secrets

**[Trade-off] Vanilla JS vs framework**
→ Accepting: More manual DOM manipulation, but simpler build and smaller bundle

**[Trade-off] File-based environment storage**
→ Accepting: Users must manage `.gitignore` for secrets, but gains portability

## Open Questions

1. Should we support YAML OpenAPI files in addition to JSON?
2. How should we handle authentication (API keys, OAuth, Bearer tokens) in the request builder?
3. Should request history be stored per-workspace or globally?
