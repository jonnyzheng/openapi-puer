## Why

First-time users of OpenAPI Puer lack guidance on setting up their API documentation folder structure. When users first open the extension, they need a clear onboarding flow that helps them select a folder, validates its structure, and automatically scaffolds the necessary files and directories if they don't exist.

## What Changes

- Add first-time setup detection in the sidebar when no API directory is configured
- Provide a folder selection UI in the sidebar for users to choose their API documentation folder
- Scan the selected folder to check for predefined file structure
- Auto-scaffold missing directories and files if the folder doesn't have the expected structure
- Generate a README.md file in the selected folder with documentation about the folder structure and usage
- Persist the selected folder path in workspace configuration

## Capabilities

### New Capabilities
- `first-time-onboarding`: Detects when the extension is used for the first time (no API directory configured) and displays an onboarding UI in the sidebar
- `folder-structure-validation`: Validates whether a selected folder contains the expected OpenAPI Puer file structure
- `folder-scaffolding`: Automatically creates missing directories and files to establish the standard folder structure
- `readme-generation`: Generates a README.md file documenting the folder structure, conventions, and usage guidelines

### Modified Capabilities
<!-- No existing capabilities are being modified -->

## Impact

**Affected Files:**
- `src/extension.ts` - Add first-time setup detection logic
- `src/providers/ApiTreeProvider.ts` - Add onboarding UI when no folder is configured
- `src/services/ConfigService.ts` - Add folder validation and scaffolding methods
- `package.json` - May need new commands for folder setup

**New Files:**
- Template files for README.md generation
- Folder structure definition/schema

**User Experience:**
- Improves first-time user experience with guided setup
- Reduces confusion about folder structure requirements
- Provides clear documentation in the user's workspace
