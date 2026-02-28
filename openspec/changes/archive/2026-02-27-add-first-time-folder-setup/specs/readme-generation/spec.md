## ADDED Requirements

### Requirement: Generate README.md during scaffolding
The system SHALL generate a README.md file in the selected folder during the scaffolding process.

#### Scenario: Create README.md in empty folder
- **WHEN** scaffolding a folder that does not contain README.md
- **THEN** the system creates a README.md file with comprehensive documentation

#### Scenario: Skip existing README.md
- **WHEN** scaffolding a folder that already contains README.md
- **THEN** the system does not overwrite the existing README.md file

### Requirement: Include overview section
The README.md SHALL include an overview section explaining OpenAPI Puer and its purpose.

#### Scenario: Overview content
- **WHEN** generating README.md
- **THEN** the file includes a section titled "OpenAPI Puer API Documentation" with a brief description of the extension

### Requirement: Include folder structure documentation
The README.md SHALL document the expected folder structure and the purpose of each directory and file.

#### Scenario: Folder structure section
- **WHEN** generating README.md
- **THEN** the file includes a "Folder Structure" section explaining:
  - `.openapi-puer/` directory purpose
  - `environments.json` file purpose
  - Where to place API specification files

### Requirement: Include quick start guide
The README.md SHALL include a quick start guide with basic usage instructions.

#### Scenario: Quick start content
- **WHEN** generating README.md
- **THEN** the file includes a "Quick Start" section with steps to:
  - Create or import OpenAPI specification files
  - Use the tree view to browse APIs
  - Send requests using the request panel
  - Manage environments

### Requirement: Include links to documentation
The README.md SHALL include links to external documentation and resources.

#### Scenario: Documentation links
- **WHEN** generating README.md
- **THEN** the file includes a "Resources" or "Documentation" section with links to:
  - OpenAPI Puer extension documentation
  - OpenAPI specification documentation
  - GitHub repository (if applicable)

### Requirement: Use markdown formatting
The README.md SHALL use proper markdown formatting for readability.

#### Scenario: Markdown structure
- **WHEN** generating README.md
- **THEN** the file uses:
  - Headers (# ## ###) for section hierarchy
  - Code blocks for examples
  - Lists for step-by-step instructions
  - Links for external resources

### Requirement: Handle README.md generation errors
The system SHALL handle errors during README.md generation gracefully.

#### Scenario: Write permission error
- **WHEN** the system lacks write permissions to create README.md
- **THEN** the system logs the error but continues with the rest of the scaffolding process

#### Scenario: Template not found error
- **WHEN** the README.md template is missing or corrupted
- **THEN** the system logs the error and skips README.md generation without failing the entire scaffolding process
