---
name: openapi-puer
description: "Manage OpenAPI documentation following OpenAPI Puer's multi-file folder structure. Use this skill whenever the user wants to create, edit, scaffold, or manage API documentation — including adding endpoints, schemas, parameters, responses, servers, or environments. Also use it when the user asks to generate an API spec from a natural language description, validate an existing API folder structure, or work with OpenAPI JSON files in the paths/ and components/ directories. Trigger phrases: 'add an endpoint', 'create API docs', 'scaffold API folder', 'add a schema', 'generate OpenAPI', 'new API', 'add parameter', 'manage environments', 'validate API structure'."
---

# OpenAPI Puer — API Documentation Management

This skill helps you create and manage API documentation using **OpenAPI Puer's multi-file folder convention**. Every OpenAPI Puer project follows a specific directory layout where endpoints, schemas, parameters, and configuration live in separate organized files rather than a single monolithic spec.

## Folder Structure (Non-Negotiable)

Every OpenAPI Puer project has this exact structure:

```
<api-root>/
├── .openapi-puer/              # Extension configuration (hidden)
│   └── environments.json       # Environment variables for requests
├── components/                 # Reusable OpenAPI components
│   ├── parameters/
│   │   ├── cookie.json         # Cookie parameter definitions
│   │   ├── header.json         # Header parameter definitions
│   │   ├── path.json           # Path parameter definitions
│   │   └── query.json          # Query parameter definitions
│   ├── responses/              # Reusable response definitions
│   ├── requestBodies/          # Reusable request body definitions
│   └── schemas/                # Schema/model definitions (one file per domain)
├── paths/                      # API endpoint definitions (one file per resource)
├── api.json                    # Main API file (info, servers, top-level paths)
└── README.md                   # Auto-generated project documentation
```

This structure is validated by the extension. All 9 required items must exist:
`.openapi-puer/`, `.openapi-puer/environments.json`, `components/`, `components/parameters/`, `components/responses/`, `components/requestBodies/`, `components/schemas/`, `paths/`, `api.json`.

## Supported OpenAPI Versions

- **3.0.3** — Widely used, broad tool support
- **3.1.1** — Default for new projects, JSON Schema compatible
- **3.2.0** — Latest spec version

The extension does NOT support Swagger 2.0 for new files. Use `3.1.1` as default unless the user specifies otherwise. If an existing `api.json` already has a version, match it across all files.

## File Conventions

### api.json — The Main File

Contains API metadata, servers, and optionally top-level paths. This is the entry point.

```json
{
  "openapi": "3.1.1",
  "info": {
    "title": "My API",
    "version": "1.0.0",
    "description": ""
  },
  "servers": [
    {
      "url": "https://api.example.com",
      "description": "Production"
    }
  ],
  "paths": {}
}
```

- `paths` in api.json is typically empty or contains a few top-level routes — most endpoints go in `paths/*.json` files.
- The `openapi` version here is the source of truth for the whole project.

### paths/*.json — Endpoint Files

Each file in `paths/` defines endpoints for a resource or domain. Filenames are **always lowercase** — name after the resource (e.g., `users.json`, `products.json`, `orders.json`). Never use PascalCase for filenames.

Every paths file is a **standalone OpenAPI document** — it MUST have all four top-level fields: `openapi`, `info`, `paths`. This is critical because the extension treats each file independently.

```json
{
  "openapi": "3.1.1",
  "info": {
    "title": "users",
    "version": "1.0.0",
    "description": ""
  },
  "paths": {
    "/users": {
      "get": {
        "summary": "List users",
        "operationId": "list-users",
        "tags": ["Users"],
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "$ref": "../components/schemas/user.json#/components/schemas/User"
                  }
                }
              }
            }
          }
        }
      },
      "post": {
        "summary": "Create user",
        "operationId": "create-user",
        "tags": ["Users"],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "../components/schemas/user.json#/components/schemas/CreateUserRequest"
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "User created"
          }
        }
      }
    },
    "/users/{userId}": {
      "get": {
        "summary": "Get user by ID",
        "operationId": "get-user",
        "tags": ["Users"],
        "parameters": [
          {
            "name": "userId",
            "in": "path",
            "required": true,
            "schema": { "type": "string", "format": "uuid" }
          }
        ],
        "responses": {
          "200": {
            "description": "User details",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "../components/schemas/user.json#/components/schemas/User"
                }
              }
            }
          },
          "404": { "description": "User not found" }
        }
      }
    }
  }
}
```

**Key conventions for paths files:**
- `info.title` = resource name (lowercase, matches filename without extension)
- `operationId` = kebab-case, descriptive (e.g., `list-users`, `create-user`, `get-user-by-id`)
- `tags` = PascalCase resource name (e.g., `["Users"]`)
- Every operation MUST have at least a `responses` object with at minimum a success response
- Use `$ref` to reference schemas in `../components/schemas/` — the format is `../components/schemas/<file>.json#/components/schemas/<SchemaName>`

### components/schemas/*.json — Schema Files

Each file defines one or more related schemas. Filenames are **always lowercase** (e.g., `user.json`, `product.json`). Never use PascalCase for filenames — only schema *names* inside the file are PascalCase.

```json
{
  "components": {
    "schemas": {
      "User": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "format": "uuid" },
          "username": {
            "type": "string",
            "description": "Username, 3-20 chars",
            "minLength": 3,
            "maxLength": 20
          },
          "email": {
            "type": "string",
            "format": "email",
            "description": "User email"
          }
        },
        "required": ["id", "username", "email"]
      },
      "CreateUserRequest": {
        "type": "object",
        "properties": {
          "username": { "type": "string", "minLength": 3, "maxLength": 20 },
          "email": { "type": "string", "format": "email" }
        },
        "required": ["username", "email"]
      }
    }
  }
}
```

**Schema conventions:**
- Schema names are PascalCase (e.g., `User`, `CreateUserRequest`, `ProductResponse`)
- Group related schemas in one file (e.g., `User`, `CreateUserRequest`, `UpdateUserRequest` all in `user.json`)
- No `openapi` or `info` fields needed — the file structure is JUST `{ "components": { "schemas": { ... } } }`. Do NOT put bare schema objects at the root — they MUST be wrapped under `components.schemas`
- Use JSON Schema validation keywords if need: `type`, `format`, `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`, `enum`, `default`, `example`, `nullable`, `description`
- Supported types: `object`, `array`, `string`, `integer`, `number`, `boolean`
- For 3.1+, nullable is expressed as `"type": ["string", "null"]` instead of `"nullable": true`

### components/parameters/*.json — Reusable Parameters

Four files, split by parameter location:

- `query.json` — Common Query string parameters
- `header.json` — Common HTTP header parameters
- `path.json` — Common URL path parameters
- `cookie.json` — Common Cookie parameters

Each file wraps parameters under `components.parameters`:

```json
{
  "openapi": "3.1.1",
  "components": {
    "parameters": {
      "PageParam": {
        "name": "page",
        "in": "query",
        "description": "Page number",
        "required": false,
        "schema": { "type": "integer", "minimum": 1, "default": 1 },
        "example": 1
      }
    }
  }
}
```

**Parameter naming:** PascalCase with suffix indicating type — e.g., `PageParam`, `AuthorizationHeader`, `SessionIdCookie`, `UserIdParam`.

### components/responses/*.json — Reusable Responses

```json
{
  "openapi": "3.1.1",
  "responses": {
    "successResponse": {
      "description": "Standard success response",
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "status": { "type": "string", "enum": ["success", "error"], "default": "success" },
              "message": { "type": "string" },
              "data": { "type": "object" }
            }
          }
        }
      }
    }
  }
}
```

### .openapi-puer/environments.json — Environment Configuration

```json
{
  "environments": [
    {
      "id": "env_dev",
      "name": "Development",
      "baseUrl": "http://localhost:3000",
      "description": "Local development",
      "variables": [
        {
          "key": "apiKey",
          "value": "dev-key-123",
          "description": "Development API key",
          "type": "text"
        }
      ],
    },
    {
      "id": "env_prod",
      "name": "Production",
      "baseUrl": "https://api.example.com",
      "description": "Production environment",
      "variables": [
        {
          "key": "apiKey",
          "value": "",
          "description": "Production API key",
          "isSecret": true,
          "type": "secret"
        }
      ],
    }
  ]
}
```

- Environment IDs follow the pattern `env_<name>` (e.g., `env_dev`, `env_prod`, `env_staging`)
- Variables use `{{variableName}}` syntax in requests
- Secret variables have `"isSecret": true` and `"type": "secret"`

## Operations Guide

### Scaffolding a New Project

When the user wants to create a new API documentation project:

1. find the API docs root directory form .vscode/settings.json setting as "openapi-puer.apiDirectory": "api-doc",  or ask the user to select a folder, when user select a folder, save the path to "openapi-puer.apiDirectory" setting in .vscode/settings.json for future use.
2. Create all required directories
3. Create `api.json` with the user's API title (or "My API" as default)
4. Create empty parameter files (`cookie.json`, `header.json`, `path.json`, `query.json`)
5. Create `environments.json` with a Default environment
6. Generate `README.md` using the template from `references/readme-template.md`

Never overwrite existing files. Only create what's missing.

### Adding Endpoints

When the user wants to add an API endpoint:

1. Determine the resource name → this maps to a file in `paths/` (e.g., "user endpoints" → `paths/users.json`)
2. If the file doesn't exist, create it as a standalone OpenAPI document
3. Add the path and method under the `paths` object
4. Every endpoint must have: `summary`, `operationId`, `responses` (at minimum)
5. For path parameters like `{id}`, add them to `parameters` with `in: "path"` and `required: true`
6. Use `$ref` for request/response schemas when they reference component schemas

### Adding Schemas

When the user wants to define a data model:

1. Determine the domain → maps to a file in `components/schemas/` (e.g., "user model" → `components/schemas/user.json`)
2. If the file doesn't exist, create it with the `{ "components": { "schemas": {} } }` wrapper
3. Add the schema under `components.schemas` with a PascalCase name
4. Include proper validation keywords (`type`, `format`, `required`, `description`, etc.)
5. Consider creating companion schemas (e.g., `CreateUserRequest`, `UpdateUserRequest` alongside `User`)

### Adding Reusable Parameters

1. Determine the parameter location (`query`, `header`, `path`, `cookie`)
2. Open the corresponding file in `components/parameters/`
3. Add the parameter with a PascalCase key name
4. Include: `name`, `in`, `description`, `schema`, and optionally `required`, `example`, `deprecated`

### Managing Environments

1. Read `.openapi-puer/environments.json`
2. Add/edit/remove environment entries
3. Each environment needs a unique `id` (format: `env_<name>`), `name`, `baseUrl`
4. Add variables with `key`, `value`, `description`
5. Mark sensitive values with `"isSecret": true, "type": "secret"`
6. Update `updatedAt` timestamp when modifying

### Validating Structure

When checking an existing project:

1. Verify all 9 required items exist
2. Check `api.json` has a valid `openapi` version (3.0.x, 3.1.x, or 3.2.x)
3. Report what's missing or malformed
4. Offer to fix/scaffold missing pieces

### Generating from Natural Language

When the user describes an API in plain English:

1. Identify resources (nouns → schemas and path files)
2. Identify operations (verbs → endpoints with methods)
3. Identify relationships (foreign keys, nested objects)
4. Create the full folder structure
5. Generate schema files for each resource
6. Generate paths files with proper CRUD endpoints
7. Set up `api.json` with servers if mentioned
8. Create environments if the user mentions different deployment targets

For the README template used during scaffolding, read `references/readme-template.md`.

## Cross-Referencing Between Files

The `$ref` format for referencing schemas from paths files:

```
../components/schemas/<filename>.json#/components/schemas/<SchemaName>
```

For referencing reusable responses:

```
../components/responses/<filename>.json/responses/<responseName>/content/application~1json/schema
```

Note: `/` in content types is escaped as `~1` in JSON Pointer syntax.

## Output Quality Checklist

Before delivering any API documentation changes, verify:

- [ ] All JSON files are valid JSON with 2-space indentation
- [ ] `openapi` version is consistent across all files in the project
- [ ] Every endpoint has at least `summary`, `operationId`, and a `responses` object
- [ ] Path parameters have matching `parameters` entries with `in: "path"` and `required: true`
- [ ] Schema names are PascalCase
- [ ] `operationId` values are kebab-case and unique across the project
- [ ] `$ref` paths use the correct relative path format
- [ ] No duplicate parameter names within the same location (query, header, etc.)
