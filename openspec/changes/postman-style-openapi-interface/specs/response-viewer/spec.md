## ADDED Requirements

### Requirement: Display response section
The system SHALL display a response section after a request completes.

#### Scenario: Show response panel
- **WHEN** a response is received
- **THEN** a "Response" section SHALL appear below the request builder

#### Scenario: Hide when no response
- **WHEN** no request has been sent yet
- **THEN** the response section SHALL display a placeholder message "Send a request to see the response"

### Requirement: Display response status
The system SHALL display the response status information prominently.

#### Scenario: Show status code
- **WHEN** a response is received
- **THEN** the status code and status text SHALL be displayed (e.g., "200 OK")

#### Scenario: Color code status
- **WHEN** the status code is displayed
- **THEN** it SHALL be color-coded (2xx=green, 3xx=blue, 4xx=yellow, 5xx=red)

#### Scenario: Show response time
- **WHEN** a response is received
- **THEN** the total request duration SHALL be displayed in milliseconds

#### Scenario: Show response size
- **WHEN** a response is received
- **THEN** the response body size SHALL be displayed in bytes/KB/MB

### Requirement: Display response headers
The system SHALL display all response headers.

#### Scenario: Show headers tab
- **WHEN** a response is received
- **THEN** a "Headers" tab SHALL be available showing all response headers

#### Scenario: Headers format
- **WHEN** headers are displayed
- **THEN** they SHALL be shown as a key-value list with proper formatting

#### Scenario: Copy header value
- **WHEN** user clicks on a header value
- **THEN** the value SHALL be copied to clipboard

### Requirement: Display response body
The system SHALL display the response body with appropriate formatting.

#### Scenario: Show body tab
- **WHEN** a response is received
- **THEN** a "Body" tab SHALL be available showing the response body

#### Scenario: JSON formatting
- **WHEN** the response Content-Type is application/json
- **THEN** the body SHALL be displayed with JSON syntax highlighting and pretty-printing

#### Scenario: XML formatting
- **WHEN** the response Content-Type is application/xml or text/xml
- **THEN** the body SHALL be displayed with XML syntax highlighting

#### Scenario: HTML formatting
- **WHEN** the response Content-Type is text/html
- **THEN** the body SHALL be displayed with HTML syntax highlighting

#### Scenario: Plain text
- **WHEN** the response Content-Type is text/plain or unknown
- **THEN** the body SHALL be displayed as plain text

#### Scenario: Binary response
- **WHEN** the response is binary data (image, PDF, etc.)
- **THEN** the body SHALL display a message indicating binary content with size and type

### Requirement: Format and view options
The system SHALL provide options for viewing the response body.

#### Scenario: Toggle pretty print
- **WHEN** viewing JSON or XML response
- **THEN** a toggle SHALL allow switching between pretty-printed and raw format

#### Scenario: Word wrap toggle
- **WHEN** viewing response body
- **THEN** a toggle SHALL allow enabling/disabling word wrap

#### Scenario: Line numbers
- **WHEN** viewing response body
- **THEN** line numbers SHALL be displayed alongside the content

### Requirement: Search in response
The system SHALL allow searching within the response body.

#### Scenario: Search input
- **WHEN** user presses Ctrl+F (Cmd+F on Mac) in the response viewer
- **THEN** a search input field SHALL appear

#### Scenario: Highlight matches
- **WHEN** user enters a search term
- **THEN** all matches SHALL be highlighted in the response body

#### Scenario: Navigate matches
- **WHEN** matches are found
- **THEN** up/down arrows SHALL allow navigating between matches

### Requirement: Copy response
The system SHALL allow copying response data.

#### Scenario: Copy body button
- **WHEN** a response body is displayed
- **THEN** a "Copy" button SHALL copy the entire body to clipboard

#### Scenario: Copy as cURL
- **WHEN** user clicks "Copy as cURL"
- **THEN** the system SHALL copy the request as a cURL command to clipboard

### Requirement: Save response
The system SHALL allow saving the response to a file.

#### Scenario: Save response button
- **WHEN** user clicks "Save Response"
- **THEN** a file save dialog SHALL open with appropriate default filename and extension

#### Scenario: Default filename
- **WHEN** saving a response
- **THEN** the default filename SHALL be based on the endpoint path and timestamp
