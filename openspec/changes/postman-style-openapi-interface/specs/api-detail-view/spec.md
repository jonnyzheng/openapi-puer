## ADDED Requirements

### Requirement: Display endpoint details in webview
The system SHALL display detailed endpoint information in a webview panel when an endpoint is selected.

#### Scenario: Open endpoint panel
- **WHEN** user selects an endpoint from the tree view
- **THEN** a webview panel SHALL open in the editor area showing the endpoint details

#### Scenario: Panel title
- **WHEN** an endpoint panel is opened
- **THEN** the panel title SHALL show the HTTP method and path (e.g., "GET /users/{id}")

### Requirement: Show endpoint metadata
The system SHALL display the endpoint's metadata section.

#### Scenario: Display summary and description
- **WHEN** an endpoint has summary and/or description defined
- **THEN** the panel SHALL display them prominently at the top

#### Scenario: Display operation ID
- **WHEN** an endpoint has an operationId defined
- **THEN** the panel SHALL display it in the metadata section

#### Scenario: Display tags
- **WHEN** an endpoint has tags defined
- **THEN** the panel SHALL display them as badges/chips

### Requirement: Display parameters section
The system SHALL display all parameters for the endpoint.

#### Scenario: Show parameter table
- **WHEN** an endpoint has parameters defined
- **THEN** the panel SHALL display a table with columns: Name, Location, Type, Required, Description

#### Scenario: Indicate required parameters
- **WHEN** a parameter is marked as required
- **THEN** it SHALL be visually highlighted (e.g., asterisk, bold, or colored indicator)

#### Scenario: Show parameter location
- **WHEN** parameters are displayed
- **THEN** each parameter SHALL indicate its location (path, query, header, cookie)

### Requirement: Display request body schema
The system SHALL display the request body schema when defined.

#### Scenario: Show request body section
- **WHEN** an endpoint has a request body defined
- **THEN** the panel SHALL display a "Request Body" section with content type and schema

#### Scenario: Display schema structure
- **WHEN** a request body schema is displayed
- **THEN** it SHALL show the JSON schema structure with property names, types, and descriptions

#### Scenario: Multiple content types
- **WHEN** a request body supports multiple content types
- **THEN** the panel SHALL allow switching between them via tabs or dropdown

### Requirement: Display response schemas
The system SHALL display response schemas for all defined status codes.

#### Scenario: Show responses section
- **WHEN** an endpoint has responses defined
- **THEN** the panel SHALL display a "Responses" section listing all status codes

#### Scenario: Display response by status code
- **WHEN** a response status code is selected
- **THEN** the panel SHALL show the response description and schema

#### Scenario: Color code status codes
- **WHEN** response status codes are displayed
- **THEN** they SHALL be color-coded (2xx=green, 3xx=blue, 4xx=yellow, 5xx=red)

### Requirement: Collapsible sections
The system SHALL allow users to collapse/expand detail sections.

#### Scenario: Collapse section
- **WHEN** user clicks on a section header (Parameters, Request Body, Responses)
- **THEN** that section SHALL collapse to hide its content

#### Scenario: Expand section
- **WHEN** user clicks on a collapsed section header
- **THEN** that section SHALL expand to show its content

#### Scenario: Remember collapse state
- **WHEN** user collapses a section and reopens the same endpoint
- **THEN** the section SHALL remain collapsed
