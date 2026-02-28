## Context

Currently, OpenAPI Puer requires users to manually configure an API directory through VS Code settings. First-time users have no guidance on:
- Where to create their API documentation folder
- What structure the folder should have
- What files are needed to get started

The extension silently fails or shows an empty tree view when no directory is configured, leading to confusion.

**Current State:**
- ConfigService manages the API directory path
- ApiTreeProvider displays the tree view
- No onboarding flow exists for first-time users

**Constraints:**
- Must work across different operating systems (Windows, macOS, Linux)
- Should not interfere with existing users who already have folders configured
- Must follow VS Code extension UX patterns

## Goals / Non-Goals

**Goals:**
- Detect when the extension is used for the first time (no API directory configured)
- Provide a clear UI in the sidebar to guide users through folder selection
- Validate selected folders and auto-scaffold missing structure
- Generate helpful README.md documentation in the user's folder
- Make the onboarding experience seamless and non-intrusive

**Non-Goals:**
- Migrating existing folder structures to a new format
- Providing multiple folder structure templates or presets
- Auto-detecting API folders without user selection
- Creating a multi-step wizard UI (keep it simple)

## Decisions

### Decision 1: Onboarding UI Location
**Choice:** Display onboarding UI in the tree view sidebar when no API directory is configured

**Rationale:**
- Users naturally look at the sidebar when opening the extension
- Tree view supports custom welcome content via `TreeDataProvider`
- Keeps the UI in context rather than showing modal dialogs
- Follows VS Code patterns (e.g., Git extension shows "Initialize Repository" button)

**Alternatives Considered:**
- Modal dialog on activation: Too intrusive, blocks other work
- Status bar notification: Easy to miss, not prominent enough
- Command palette only: Requires users to know what command to run

### Decision 2: Folder Structure Definition
**Choice:** Define a minimal required structure with optional directories

**Required:**
- `.openapi-puer/` directory for extension metadata
- `.openapi-puer/environments.json` for environment configuration
- `README.md` with documentation

**Optional (created on demand):**
- API specification files (created by users)
- Subdirectories for organization

**Rationale:**
- Minimal structure reduces friction for new users
- `.openapi-puer/` directory already used by EnvironmentService
- README.md provides immediate value and documentation
- Users can organize API files as they prefer

**Alternatives Considered:**
- Strict folder structure with predefined directories: Too opinionated, limits flexibility
- No structure validation: Misses opportunity to guide users
- Template-based approach with multiple presets: Adds complexity

### Decision 3: Validation Strategy
**Choice:** Validate folder structure on selection, prompt to scaffold if incomplete

**Flow:**
1. User clicks "Select Folder" button in tree view
2. VS Code folder picker opens
3. Extension validates selected folder
4. If structure is incomplete, show confirmation dialog: "This folder doesn't have the OpenAPI Puer structure. Create it now?"
5. If user confirms, scaffold the structure
6. Save folder path to configuration

**Rationale:**
- Explicit user confirmation prevents unwanted file creation
- Validation happens at selection time, not on every activation
- Clear feedback about what will be created

**Alternatives Considered:**
- Auto-scaffold without confirmation: Could surprise users
- Require manual structure creation: Defeats the purpose of onboarding
- Validate on every activation: Performance overhead

### Decision 4: README.md Content
**Choice:** Generate a comprehensive README.md with:
- Overview of OpenAPI Puer
- Folder structure explanation
- Quick start guide
- Links to documentation

**Rationale:**
- Provides immediate value in the user's workspace
- Serves as reference documentation
- Can be customized by users
- Follows common practice (most projects have README)

**Alternatives Considered:**
- No README generation: Misses opportunity to educate users
- Minimal README with just structure: Less helpful
- Interactive tutorial: Too complex for initial implementation

### Decision 5: Implementation in ConfigService
**Choice:** Add validation and scaffolding methods to ConfigService

**New Methods:**
- `validateFolderStructure(folderPath: string): ValidationResult`
- `scaffoldFolderStructure(folderPath: string): Promise<void>`
- `generateReadme(folderPath: string): Promise<void>`

**Rationale:**
- ConfigService already manages API directory configuration
- Keeps folder-related logic centralized
- Reusable methods for future features

**Alternatives Considered:**
- New OnboardingService: Adds complexity for a focused feature
- Inline in ApiTreeProvider: Violates separation of concerns
- Utility functions: Less discoverable, harder to test

## Risks / Trade-offs

**Risk:** Users select a folder with existing content, and scaffolding overwrites files
→ **Mitigation:** Check for existing files before creating, never overwrite without explicit confirmation

**Risk:** Different operating systems have different path conventions
→ **Mitigation:** Use VS Code's URI and path utilities, test on all platforms

**Risk:** Users dismiss the onboarding UI and can't find it again
→ **Mitigation:** Add a command "OpenAPI Puer: Setup API Folder" to command palette for re-access

**Trade-off:** Opinionated folder structure may not fit all workflows
→ **Acceptance:** Start with minimal structure, gather feedback for future iterations

**Trade-off:** README.md generation adds maintenance burden (keeping content up-to-date)
→ **Acceptance:** README content should be stable, focus on fundamentals not features

## Migration Plan

**Deployment:**
1. Add new methods to ConfigService
2. Update ApiTreeProvider to show onboarding UI when no folder configured
3. Add command for manual folder setup
4. Test on Windows, macOS, Linux
5. Release as minor version update

**Rollback Strategy:**
- Feature is additive, no breaking changes
- If issues arise, can disable onboarding UI via feature flag
- Users with existing configurations are unaffected

**Backward Compatibility:**
- Existing users with configured folders see no changes
- New folder structure is compatible with current extension functionality

## Open Questions

1. Should we support importing existing OpenAPI files during setup?
   - Deferred to future iteration

2. Should we provide example API files in the scaffolded structure?
   - Decision: No, keep it minimal. Users can create their own or import existing files.

3. Should the README.md be regenerated if deleted?
   - Decision: No, respect user's choice to remove it. Only generate on initial setup.
