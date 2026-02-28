## ADDED Requirements

### Requirement: Prompt user before scaffolding
The system SHALL prompt the user for confirmation before creating any files or directories in the selected folder.

#### Scenario: Show confirmation dialog for incomplete structure
- **WHEN** validation detects an incomplete folder structure
- **THEN** the system displays a confirmation dialog asking "This folder doesn't have the OpenAPI Puer structure. Create it now?"

#### Scenario: User confirms scaffolding
- **WHEN** user clicks "Yes" or "Create" in the confirmation dialog
- **THEN** the system proceeds with scaffolding

#### Scenario: User cancels scaffolding
- **WHEN** user clicks "No" or "Cancel" in the confirmation dialog
- **THEN** the system aborts the setup process and does not modify the folder

### Requirement: Create required directories
The system SHALL create the `.openapi-puer/` directory if it does not exist.

#### Scenario: Create .openapi-puer directory
- **WHEN** scaffolding a folder that lacks `.openapi-puer/` directory
- **THEN** the system creates the directory with appropriate permissions

#### Scenario: Skip existing directory
- **WHEN** scaffolding a folder that already has `.openapi-puer/` directory
- **THEN** the system does not recreate or modify the existing directory

### Requirement: Create required files
The system SHALL create the `environments.json` file within `.openapi-puer/` directory if it does not exist.

#### Scenario: Create environments.json with default content
- **WHEN** scaffolding a folder that lacks `environments.json`
- **THEN** the system creates the file with an empty environments array: `{"environments": []}`

#### Scenario: Skip existing environments.json
- **WHEN** scaffolding a folder that already has `environments.json`
- **THEN** the system does not overwrite the existing file

### Requirement: Handle file system errors
The system SHALL handle file system errors gracefully during scaffolding.

#### Scenario: Permission denied error
- **WHEN** the system lacks write permissions for the selected folder
- **THEN** the system displays an error message and aborts scaffolding

#### Scenario: Disk full error
- **WHEN** the file system runs out of space during scaffolding
- **THEN** the system displays an error message and cleans up any partially created files

#### Scenario: Path too long error
- **WHEN** the folder path exceeds the operating system's maximum path length
- **THEN** the system displays an error message and aborts scaffolding

### Requirement: Verify scaffolding completion
The system SHALL verify that all required files and directories were successfully created.

#### Scenario: Successful scaffolding verification
- **WHEN** all required files and directories are created without errors
- **THEN** the system confirms successful setup and proceeds to save the folder path

#### Scenario: Failed scaffolding verification
- **WHEN** any required file or directory fails to create
- **THEN** the system reports the failure and does not save the folder path to configuration
