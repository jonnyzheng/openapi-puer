## ADDED Requirements

### Requirement: Send HTTP requests
The system SHALL send HTTP requests based on the configured request builder inputs.

#### Scenario: Send button
- **WHEN** user clicks the "Send" button in the request builder
- **THEN** the system SHALL construct and send the HTTP request

#### Scenario: Keyboard shortcut
- **WHEN** user presses Ctrl+Enter (Cmd+Enter on Mac) in the request builder
- **THEN** the system SHALL send the request

### Requirement: Construct request from inputs
The system SHALL construct the full HTTP request from all input fields.

#### Scenario: Build URL with path parameters
- **WHEN** a request is sent
- **THEN** the system SHALL replace path parameter placeholders with their values

#### Scenario: Append query parameters
- **WHEN** enabled query parameters exist
- **THEN** the system SHALL append them to the URL as a query string

#### Scenario: Include headers
- **WHEN** enabled headers exist
- **THEN** the system SHALL include them in the request

#### Scenario: Include body
- **WHEN** a request body is provided
- **THEN** the system SHALL include it with the appropriate Content-Type header

### Requirement: Substitute environment variables
The system SHALL substitute environment variables before sending.

#### Scenario: Replace variable references
- **WHEN** a request contains `{{variableName}}` references
- **THEN** the system SHALL replace them with values from the active environment

#### Scenario: Undefined variable
- **WHEN** a variable reference has no defined value
- **THEN** the system SHALL display a warning and send the request with the literal `{{variableName}}` text

### Requirement: Show request progress
The system SHALL indicate when a request is in progress.

#### Scenario: Loading indicator
- **WHEN** a request is sent
- **THEN** a loading spinner SHALL be displayed until the response is received

#### Scenario: Disable send button
- **WHEN** a request is in progress
- **THEN** the Send button SHALL be disabled to prevent duplicate requests

#### Scenario: Show elapsed time
- **WHEN** a request is in progress
- **THEN** the elapsed time SHALL be displayed and updated in real-time

### Requirement: Handle request completion
The system SHALL handle both successful and failed requests.

#### Scenario: Successful response
- **WHEN** a response is received with any status code
- **THEN** the system SHALL display the response in the response viewer

#### Scenario: Network error
- **WHEN** a request fails due to network issues (DNS, connection refused, timeout)
- **THEN** the system SHALL display an error message describing the failure

#### Scenario: Request timeout
- **WHEN** a request exceeds the configured timeout (default 30 seconds)
- **THEN** the system SHALL abort the request and display "Request timed out"

### Requirement: Cancel in-flight requests
The system SHALL allow users to cancel requests in progress.

#### Scenario: Cancel button
- **WHEN** a request is in progress
- **THEN** a "Cancel" button SHALL be displayed

#### Scenario: Cancel request
- **WHEN** user clicks the Cancel button
- **THEN** the system SHALL abort the request and display "Request cancelled"

### Requirement: Support all HTTP methods
The system SHALL support all standard HTTP methods.

#### Scenario: GET request
- **WHEN** an endpoint uses GET method
- **THEN** the system SHALL send a GET request without a body

#### Scenario: POST request
- **WHEN** an endpoint uses POST method
- **THEN** the system SHALL send a POST request with the configured body

#### Scenario: PUT request
- **WHEN** an endpoint uses PUT method
- **THEN** the system SHALL send a PUT request with the configured body

#### Scenario: DELETE request
- **WHEN** an endpoint uses DELETE method
- **THEN** the system SHALL send a DELETE request

#### Scenario: PATCH request
- **WHEN** an endpoint uses PATCH method
- **THEN** the system SHALL send a PATCH request with the configured body

#### Scenario: Other methods
- **WHEN** an endpoint uses HEAD, OPTIONS, or other methods
- **THEN** the system SHALL send the request with the appropriate method
