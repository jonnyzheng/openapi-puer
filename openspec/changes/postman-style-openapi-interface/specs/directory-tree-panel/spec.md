## ADDED Requirements

### Requirement: Display sidebar tree view
The system SHALL display a tree view in the VS Code sidebar showing all discovered OpenAPI files and their endpoints.

#### Scenario: Show in activity bar
- **WHEN** the extension is activated
- **THEN** a "OpenAPI Puer" icon SHALL appear in the VS Code activity bar

#### Scenario: Display tree view panel
- **WHEN** user clicks the OpenAPI Puer activity bar icon
- **THEN** a sidebar panel SHALL open showing the API directory tree

### Requirement: Organize tree by files
The system SHALL organize the tree view with OpenAPI files as top-level nodes.

#### Scenario: Display API files
- **WHEN** OpenAPI files exist in the configured directory
- **THEN** each file SHALL appear as a collapsible top-level node with the filename as label

#### Scenario: Show file icon
- **WHEN** an OpenAPI file node is displayed
- **THEN** it SHALL display an appropriate icon indicating it is an API specification file

#### Scenario: Empty directory
- **WHEN** no OpenAPI files are found in the configured directory
- **THEN** the tree view SHALL display a message "No OpenAPI files found"

### Requirement: Display endpoints under files
The system SHALL display API endpoints as child nodes under each file.

#### Scenario: List endpoints
- **WHEN** user expands an OpenAPI file node
- **THEN** all endpoints from that file SHALL be displayed as child nodes

#### Scenario: Endpoint label format
- **WHEN** an endpoint node is displayed
- **THEN** the label SHALL show the HTTP method and path (e.g., "GET /users/{id}")

#### Scenario: Method color coding
- **WHEN** an endpoint node is displayed
- **THEN** the HTTP method SHALL be visually distinguished by color (GET=green, POST=yellow, PUT=blue, DELETE=red, PATCH=orange)

### Requirement: Group endpoints by tags
The system SHALL optionally group endpoints by their OpenAPI tags.

#### Scenario: Enable tag grouping
- **WHEN** user enables "Group by Tags" option
- **THEN** endpoints SHALL be organized under tag nodes within each file

#### Scenario: Untagged endpoints
- **WHEN** an endpoint has no tags defined
- **THEN** it SHALL appear under a "default" or "untagged" group

### Requirement: Navigate to endpoint
The system SHALL allow users to open endpoint details from the tree view.

#### Scenario: Click endpoint
- **WHEN** user clicks on an endpoint node in the tree
- **THEN** the main panel SHALL open showing that endpoint's details

#### Scenario: Double-click file
- **WHEN** user double-clicks on an OpenAPI file node
- **THEN** the file SHALL open in the VS Code editor

### Requirement: Refresh tree view
The system SHALL provide a way to manually refresh the tree view.

#### Scenario: Refresh button
- **WHEN** user clicks the refresh button in the tree view header
- **THEN** the system SHALL re-scan the directory and re-parse all OpenAPI files

#### Scenario: Refresh command
- **WHEN** user executes the "OpenAPI Puer: Refresh" command
- **THEN** the tree view SHALL refresh with updated content
