## ADDED Requirements

### Requirement: Store environment configurations
The system SHALL store environment configurations in a project-local file.

#### Scenario: Environment file location
- **WHEN** environments are created
- **THEN** they SHALL be stored in `.openapi-puer/environments.json` in the workspace root

#### Scenario: Create directory if missing
- **WHEN** the `.openapi-puer` directory does not exist
- **THEN** the system SHALL create it when saving the first environment

#### Scenario: File format
- **WHEN** environments are stored
- **THEN** the file SHALL use JSON format with an array of environment objects

### Requirement: Create environments
The system SHALL allow users to create named environments.

#### Scenario: Create environment command
- **WHEN** user executes "OpenAPI Puer: Create Environment" command
- **THEN** a dialog SHALL prompt for the environment name

#### Scenario: Create from UI
- **WHEN** user clicks the "+" button in the environment selector
- **THEN** a dialog SHALL prompt for the environment name

#### Scenario: Duplicate environment
- **WHEN** user selects "Duplicate" on an existing environment
- **THEN** a new environment SHALL be created with copied variables and a new name

### Requirement: Define environment variables
The system SHALL allow users to define key-value variables within each environment.

#### Scenario: Variable editor
- **WHEN** user opens an environment for editing
- **THEN** a table SHALL display with columns: Key, Value, Description

#### Scenario: Add variable
- **WHEN** user clicks "Add Variable"
- **THEN** a new row SHALL be added to the variable table

#### Scenario: Edit variable
- **WHEN** user modifies a variable's key or value
- **THEN** the change SHALL be saved automatically

#### Scenario: Delete variable
- **WHEN** user clicks delete on a variable row
- **THEN** the variable SHALL be removed from the environment

### Requirement: Select active environment
The system SHALL allow users to select which environment is active.

#### Scenario: Environment selector
- **WHEN** the extension is active
- **THEN** an environment selector dropdown SHALL be displayed in the status bar or panel header

#### Scenario: Switch environment
- **WHEN** user selects a different environment from the dropdown
- **THEN** that environment SHALL become active and its variables used for requests

#### Scenario: No environment option
- **WHEN** user selects "No Environment"
- **THEN** no variable substitution SHALL occur (variables remain as literal text)

#### Scenario: Persist selection
- **WHEN** user selects an environment
- **THEN** the selection SHALL persist across VS Code sessions for that workspace

### Requirement: Support common variables
The system SHALL support commonly used variable patterns.

#### Scenario: Base URL variable
- **WHEN** user defines a `baseUrl` variable
- **THEN** it SHALL be available for use in the base URL field

#### Scenario: Auth token variable
- **WHEN** user defines an `authToken` variable
- **THEN** it SHALL be available for use in Authorization headers

### Requirement: Manage sensitive variables
The system SHALL provide secure handling for sensitive values.

#### Scenario: Mark as secret
- **WHEN** user marks a variable as "secret"
- **THEN** its value SHALL be stored in VS Code's SecretStorage instead of the JSON file

#### Scenario: Display secret values
- **WHEN** a secret variable is displayed in the editor
- **THEN** its value SHALL be masked with asterisks by default

#### Scenario: Reveal secret
- **WHEN** user clicks "reveal" on a secret variable
- **THEN** the actual value SHALL be shown temporarily

### Requirement: Edit environments
The system SHALL allow users to edit existing environments.

#### Scenario: Edit environment command
- **WHEN** user executes "OpenAPI Puer: Edit Environment" command
- **THEN** the environment editor SHALL open for the active environment

#### Scenario: Rename environment
- **WHEN** user renames an environment
- **THEN** the name SHALL be updated and the environment SHALL remain selected if active

### Requirement: Delete environments
The system SHALL allow users to delete environments.

#### Scenario: Delete environment
- **WHEN** user selects "Delete" on an environment
- **THEN** a confirmation dialog SHALL appear

#### Scenario: Confirm deletion
- **WHEN** user confirms deletion
- **THEN** the environment SHALL be removed and "No Environment" selected if it was active

### Requirement: Import and export environments
The system SHALL support importing and exporting environments.

#### Scenario: Export environment
- **WHEN** user selects "Export" on an environment
- **THEN** a JSON file SHALL be saved with the environment's variables (excluding secrets)

#### Scenario: Import environment
- **WHEN** user selects "Import Environment"
- **THEN** a file picker SHALL allow selecting a JSON file to import as a new environment
