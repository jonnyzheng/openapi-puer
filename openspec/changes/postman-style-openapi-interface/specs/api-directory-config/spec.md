## ADDED Requirements

### Requirement: Configure API documents directory
The system SHALL provide a configuration setting `openapi-puer.apiDirectory` that allows users to specify the path to a directory containing OpenAPI specification files.

#### Scenario: Set directory via settings
- **WHEN** user sets `openapi-puer.apiDirectory` in VS Code settings
- **THEN** the extension SHALL use that directory as the root for API file discovery

#### Scenario: Default to workspace root
- **WHEN** no `openapi-puer.apiDirectory` is configured
- **THEN** the extension SHALL default to the workspace root directory

### Requirement: Validate configured directory
The system SHALL validate that the configured directory exists and is accessible.

#### Scenario: Valid directory configured
- **WHEN** user configures a valid, existing directory path
- **THEN** the extension SHALL accept the configuration and begin scanning for OpenAPI files

#### Scenario: Invalid directory configured
- **WHEN** user configures a path that does not exist or is not a directory
- **THEN** the extension SHALL display an error notification with the message "API directory not found: {path}"

### Requirement: Watch directory for changes
The system SHALL monitor the configured directory for file changes.

#### Scenario: New file added
- **WHEN** a new JSON file is added to the configured directory
- **THEN** the extension SHALL automatically detect and parse the file if it is a valid OpenAPI spec

#### Scenario: File modified
- **WHEN** an existing OpenAPI file is modified
- **THEN** the extension SHALL re-parse the file and update the UI accordingly

#### Scenario: File deleted
- **WHEN** an OpenAPI file is deleted from the directory
- **THEN** the extension SHALL remove it from the tree view and close any open panels for that file
