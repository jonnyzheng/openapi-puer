## 1. ConfigService - Add Validation and Scaffolding Methods

- [x] 1.1 Add `validateFolderStructure(folderPath: string)` method that checks for `.openapi-puer/` directory and `environments.json` file
- [x] 1.2 Add `scaffoldFolderStructure(folderPath: string)` method that creates missing directories and files
- [x] 1.3 Add `generateReadme(folderPath: string)` method that creates README.md with documentation
- [x] 1.4 Create README template content with overview, folder structure, quick start, and documentation links
- [x] 1.5 Add error handling for file system operations (permissions, disk space, path length)
- [x] 1.6 Ensure existing files are never overwritten during scaffolding

## 2. ApiTreeProvider - Add Onboarding UI

- [x] 2.1 Detect when no API directory is configured in `getChildren()` method
- [x] 2.2 Return custom tree items for onboarding UI when no folder is configured
- [x] 2.3 Create welcome message tree item with description text
- [x] 2.4 Create "Select API Folder" button tree item with command
- [x] 2.5 Add icon and styling for onboarding tree items
- [x] 2.6 Ensure onboarding UI is hidden once folder is configured

## 3. Extension Commands - Add Folder Setup Command

- [x] 3.1 Register "OpenAPI Puer: Setup API Folder" command in `package.json`
- [x] 3.2 Implement command handler in `extension.ts` that opens folder picker
- [x] 3.3 Call `vscode.window.showOpenDialog()` with folder selection options
- [x] 3.4 Handle user cancellation gracefully
- [x] 3.5 Make command accessible from command palette and tree view button

## 4. Folder Selection and Validation Flow

- [x] 4.1 Implement folder selection handler that receives selected folder URI
- [x] 4.2 Call `ConfigService.validateFolderStructure()` on selected folder
- [x] 4.3 If structure is complete, save folder path to configuration and refresh tree view
- [x] 4.4 If structure is incomplete, show confirmation dialog with message "This folder doesn't have the OpenAPI Puer structure. Create it now?"
- [x] 4.5 Handle user confirmation to proceed with scaffolding
- [x] 4.6 Handle user cancellation to abort setup

## 5. Scaffolding Implementation

- [x] 5.1 Call `ConfigService.scaffoldFolderStructure()` when user confirms
- [x] 5.2 Create `.openapi-puer/` directory if missing
- [x] 5.3 Create `environments.json` with default content `{"environments": []}` if missing
- [x] 5.4 Call `ConfigService.generateReadme()` to create README.md if missing
- [x] 5.5 Verify all files and directories were created successfully
- [x] 5.6 Show error message if scaffolding fails, do not save folder path

## 6. Configuration Persistence

- [x] 6.1 Save selected folder path to `openapi-puer.apiDirectory` setting after successful scaffolding
- [x] 6.2 Use relative path if folder is within workspace, absolute path otherwise
- [x] 6.3 Trigger tree view refresh after configuration is saved
- [x] 6.4 Ensure ConfigService file watcher picks up the new configuration

## 7. Error Handling and Edge Cases

- [x] 7.1 Handle permission denied errors with user-friendly error messages
- [x] 7.2 Handle disk full errors and clean up partial scaffolding
- [x] 7.3 Handle path too long errors on Windows
- [x] 7.4 Test with folders containing existing content (don't overwrite)
- [x] 7.5 Test with empty folders
- [x] 7.6 Test with folders that already have partial structure

## 8. Testing

- [x] 8.1 Write unit tests for folder selection and scaffolding
- [x] 8.2 Write unit tests to verify path handling works correctly
- [x] 8.3 Write unit tests to verify file permissions are set correctly

## 9. Documentation and Polish

- [x] 9.1 Update extension README with information about first-time setup
- [x] 9.2 Add screenshots of onboarding UI to documentation
- [x] 9.3 Ensure command appears in command palette with proper category
- [x] 9.4 Test that existing users with configured folders see no changes
