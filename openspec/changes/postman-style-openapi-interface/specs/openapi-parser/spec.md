## ADDED Requirements

### Requirement: Parse OpenAPI 2.0 specifications
The system SHALL parse and validate JSON files conforming to the OpenAPI 2.0 (Swagger) specification.

#### Scenario: Valid OpenAPI 2.0 file
- **WHEN** a JSON file with `"swagger": "2.0"` is loaded
- **THEN** the system SHALL parse it and extract all paths, operations, and schemas

#### Scenario: Invalid OpenAPI 2.0 file
- **WHEN** a JSON file claims to be OpenAPI 2.0 but has schema violations
- **THEN** the system SHALL display validation errors in the Problems panel

### Requirement: Parse OpenAPI 3.0 specifications
The system SHALL parse and validate JSON files conforming to the OpenAPI 3.0.x specification.

#### Scenario: Valid OpenAPI 3.0 file
- **WHEN** a JSON file with `"openapi": "3.0.x"` is loaded
- **THEN** the system SHALL parse it and extract all paths, operations, components, and schemas

#### Scenario: Resolve $ref references in 3.0
- **WHEN** an OpenAPI 3.0 file contains `$ref` references to components
- **THEN** the system SHALL resolve all references and provide dereferenced schema data

### Requirement: Parse OpenAPI 3.1 specifications
The system SHALL parse and validate JSON files conforming to the OpenAPI 3.1.x specification.

#### Scenario: Valid OpenAPI 3.1 file
- **WHEN** a JSON file with `"openapi": "3.1.x"` is loaded
- **THEN** the system SHALL parse it and extract all paths, operations, and JSON Schema-compliant schemas

### Requirement: Extract endpoint information
The system SHALL extract structured endpoint information from parsed OpenAPI files.

#### Scenario: Extract path and method
- **WHEN** an OpenAPI file is parsed
- **THEN** the system SHALL provide a list of endpoints with their HTTP method (GET, POST, PUT, DELETE, PATCH, etc.) and path

#### Scenario: Extract operation metadata
- **WHEN** an endpoint is selected
- **THEN** the system SHALL provide the operation's summary, description, operationId, and tags

#### Scenario: Extract parameters
- **WHEN** an endpoint has parameters defined
- **THEN** the system SHALL provide parameter details including name, location (path, query, header, cookie), type, required status, and description

#### Scenario: Extract request body schema
- **WHEN** an endpoint has a requestBody defined (OpenAPI 3.x) or body parameter (OpenAPI 2.0)
- **THEN** the system SHALL provide the request body schema with content types and structure

#### Scenario: Extract response schemas
- **WHEN** an endpoint has responses defined
- **THEN** the system SHALL provide response schemas for each status code with content types and structure

### Requirement: Handle parsing errors gracefully
The system SHALL handle malformed or invalid files without crashing.

#### Scenario: Malformed JSON
- **WHEN** a file contains invalid JSON syntax
- **THEN** the system SHALL display an error message "Failed to parse {filename}: Invalid JSON" and skip the file

#### Scenario: Non-OpenAPI JSON file
- **WHEN** a valid JSON file does not contain OpenAPI markers (swagger or openapi fields)
- **THEN** the system SHALL silently skip the file without displaying errors
