## ADDED Requirements

### Requirement: Detect first-time usage
The system SHALL detect when the extension is activated and no API directory is configured in the workspace settings.

#### Scenario: Extension activated with no API directory
- **WHEN** the extension activates and `openapi-puer.apiDirectory` is not set
- **THEN** the system identifies this as first-time usage

#### Scenario: Extension activated with existing API directory
- **WHEN** the extension activates and `openapi-puer.apiDirectory` is already configured
- **THEN** the system does not trigger first-time onboarding

### Requirement: Display onboarding UI in tree view
The system SHALL display an onboarding UI in the tree view sidebar when first-time usage is detected.

#### Scenario: Show welcome message and setup button
- **WHEN** first-time usage is detected
- **THEN** the tree view displays a welcome message and a "Select API Folder" button

#### Scenario: Hide onboarding UI after folder selection
- **WHEN** user successfully selects and configures an API folder
- **THEN** the onboarding UI is replaced with the normal tree view

### Requirement: Provide folder selection command
The system SHALL provide a command to open the folder selection dialog.

#### Scenario: User clicks Select API Folder button
- **WHEN** user clicks the "Select API Folder" button in the tree view
- **THEN** VS Code's folder picker dialog opens

#### Scenario: User invokes command from command palette
- **WHEN** user runs "OpenAPI Puer: Setup API Folder" from the command palette
- **THEN** VS Code's folder picker dialog opens

### Requirement: Persist folder selection
The system SHALL save the selected folder path to workspace configuration after successful setup.

#### Scenario: Save folder path after scaffolding
- **WHEN** user selects a folder and completes the setup process
- **THEN** the folder path is saved to `openapi-puer.apiDirectory` setting

#### Scenario: Use relative path for workspace folders
- **WHEN** the selected folder is within the current workspace
- **THEN** the system saves a relative path instead of absolute path

#### Scenario: Use absolute path for external folders
- **WHEN** the selected folder is outside the current workspace
- **THEN** the system saves an absolute path
