## ADDED Requirements

### Requirement: Validate folder structure on selection
The system SHALL validate the selected folder to determine if it contains the expected OpenAPI Puer structure.

#### Scenario: Folder has complete structure
- **WHEN** user selects a folder that contains `.openapi-puer/` directory and `environments.json`
- **THEN** the system identifies the folder as having a complete structure

#### Scenario: Folder has incomplete structure
- **WHEN** user selects a folder that is missing `.openapi-puer/` directory or `environments.json`
- **THEN** the system identifies the folder as having an incomplete structure

#### Scenario: Folder is empty
- **WHEN** user selects an empty folder
- **THEN** the system identifies the folder as having an incomplete structure

### Requirement: Check for required directories
The system SHALL verify the presence of the `.openapi-puer/` directory in the selected folder.

#### Scenario: .openapi-puer directory exists
- **WHEN** validating a folder that contains `.openapi-puer/` directory
- **THEN** the directory check passes

#### Scenario: .openapi-puer directory missing
- **WHEN** validating a folder that does not contain `.openapi-puer/` directory
- **THEN** the directory check fails

### Requirement: Check for required files
The system SHALL verify the presence of `environments.json` file within the `.openapi-puer/` directory.

#### Scenario: environments.json exists
- **WHEN** validating a folder where `.openapi-puer/environments.json` exists
- **THEN** the file check passes

#### Scenario: environments.json missing
- **WHEN** validating a folder where `.openapi-puer/environments.json` does not exist
- **THEN** the file check fails

### Requirement: Return validation result
The system SHALL return a validation result indicating whether the structure is complete and what is missing.

#### Scenario: Complete structure validation result
- **WHEN** all required directories and files are present
- **THEN** the validation result indicates the structure is complete

#### Scenario: Incomplete structure validation result
- **WHEN** required directories or files are missing
- **THEN** the validation result indicates the structure is incomplete and lists missing items
