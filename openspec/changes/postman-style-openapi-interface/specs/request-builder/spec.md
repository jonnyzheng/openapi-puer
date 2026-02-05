## ADDED Requirements

### Requirement: Display request builder interface
The system SHALL provide an interface for constructing HTTP requests within the endpoint detail panel.

#### Scenario: Show request builder section
- **WHEN** an endpoint panel is opened
- **THEN** a "Request" section SHALL be displayed with input fields for building the request

#### Scenario: Pre-populate from spec
- **WHEN** the request builder is displayed
- **THEN** it SHALL pre-populate fields based on the OpenAPI specification (base URL, path, parameters)

### Requirement: Edit base URL
The system SHALL allow users to specify the base URL for requests.

#### Scenario: Display base URL field
- **WHEN** the request builder is shown
- **THEN** a base URL input field SHALL be displayed

#### Scenario: Use server from spec
- **WHEN** the OpenAPI file defines servers
- **THEN** the base URL SHALL default to the first server URL

#### Scenario: Custom base URL
- **WHEN** user enters a custom base URL
- **THEN** the system SHALL use that URL for the request

### Requirement: Edit path parameters
The system SHALL allow users to fill in path parameters.

#### Scenario: Display path parameter inputs
- **WHEN** an endpoint has path parameters (e.g., /users/{id})
- **THEN** input fields SHALL be displayed for each path parameter

#### Scenario: Validate required path parameters
- **WHEN** user attempts to send a request without filling required path parameters
- **THEN** the system SHALL highlight the missing fields and prevent sending

### Requirement: Edit query parameters
The system SHALL allow users to add and edit query parameters.

#### Scenario: Display query parameter table
- **WHEN** an endpoint has query parameters defined
- **THEN** a table SHALL display with columns: Enabled (checkbox), Key, Value

#### Scenario: Pre-populate defined parameters
- **WHEN** query parameters are defined in the spec
- **THEN** they SHALL be pre-populated in the table with empty values

#### Scenario: Add custom query parameter
- **WHEN** user clicks "Add Parameter" button
- **THEN** a new row SHALL be added to the query parameter table

#### Scenario: Toggle parameter inclusion
- **WHEN** user unchecks a query parameter's checkbox
- **THEN** that parameter SHALL be excluded from the request

### Requirement: Edit request headers
The system SHALL allow users to add and edit request headers.

#### Scenario: Display headers table
- **WHEN** the request builder is shown
- **THEN** a headers table SHALL be displayed with columns: Enabled, Key, Value

#### Scenario: Pre-populate common headers
- **WHEN** the endpoint specifies required headers or content type
- **THEN** those headers SHALL be pre-populated

#### Scenario: Add custom header
- **WHEN** user clicks "Add Header" button
- **THEN** a new row SHALL be added to the headers table

### Requirement: Edit request body
The system SHALL allow users to compose the request body.

#### Scenario: Display body editor
- **WHEN** an endpoint accepts a request body (POST, PUT, PATCH)
- **THEN** a body editor section SHALL be displayed

#### Scenario: Select content type
- **WHEN** the endpoint supports multiple content types
- **THEN** a dropdown SHALL allow selecting the content type (application/json, form-data, etc.)

#### Scenario: JSON body editor
- **WHEN** content type is application/json
- **THEN** a text area with JSON syntax highlighting SHALL be displayed

#### Scenario: Generate body from schema
- **WHEN** user clicks "Generate from Schema" button
- **THEN** the system SHALL generate a sample JSON body based on the request body schema

#### Scenario: Form data editor
- **WHEN** content type is multipart/form-data or application/x-www-form-urlencoded
- **THEN** a key-value table editor SHALL be displayed instead of raw text

### Requirement: Support environment variables in inputs
The system SHALL support environment variable substitution in all input fields.

#### Scenario: Variable syntax
- **WHEN** user enters `{{variableName}}` in any input field
- **THEN** the system SHALL recognize it as an environment variable reference

#### Scenario: Variable highlighting
- **WHEN** a variable reference is entered
- **THEN** it SHALL be visually highlighted to indicate it will be substituted

#### Scenario: Show resolved value
- **WHEN** user hovers over a variable reference
- **THEN** a tooltip SHALL show the resolved value from the current environment
