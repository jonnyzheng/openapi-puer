import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class ConfigService {
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private onFileChangeEmitter = new vscode.EventEmitter<{ type: 'create' | 'change' | 'delete'; uri: vscode.Uri }>();

  readonly onFileChange = this.onFileChangeEmitter.event;

  getApiDirectory(): string {
    const config = vscode.workspace.getConfiguration('openapi-puer');
    const configuredPath = config.get<string>('apiDirectory', '');

    if (configuredPath) {
      if (path.isAbsolute(configuredPath)) {
        return configuredPath;
      }
      const workspaceRoot = this.getWorkspaceRoot();
      if (workspaceRoot) {
        return path.join(workspaceRoot, configuredPath);
      }
    }

    // Don't default to workspace root - require explicit configuration
    return '';
  }

  isApiDirectoryConfigured(): boolean {
    const config = vscode.workspace.getConfiguration('openapi-puer');
    const configuredPath = config.get<string>('apiDirectory', '');
    return configuredPath !== '';
  }

  async setApiDirectory(dirPath: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('openapi-puer');
    const workspaceRoot = this.getWorkspaceRoot();

    // Store as relative path if within workspace
    if (workspaceRoot && dirPath.startsWith(workspaceRoot)) {
      const relativePath = path.relative(workspaceRoot, dirPath);
      // Use '.' for workspace root itself, otherwise use the relative path
      const pathToStore = relativePath === '' ? '.' : relativePath;
      await config.update('apiDirectory', pathToStore, vscode.ConfigurationTarget.Workspace);
    } else {
      await config.update('apiDirectory', dirPath, vscode.ConfigurationTarget.Workspace);
    }
  }

  getWorkspaceRoot(): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      return workspaceFolders[0].uri.fsPath;
    }
    return undefined;
  }

  validateDirectory(dirPath: string): { valid: boolean; error?: string } {
    if (!dirPath) {
      return { valid: false, error: 'No directory path specified' };
    }

    if (!fs.existsSync(dirPath)) {
      return { valid: false, error: `API directory not found: ${dirPath}` };
    }

    try {
      const stat = fs.statSync(dirPath);
      if (!stat.isDirectory()) {
        return { valid: false, error: `API directory not found: ${dirPath}` };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { valid: false, error: `Cannot access directory: ${message}` };
    }

    return { valid: true };
  }

  validateAndNotify(dirPath: string): boolean {
    const result = this.validateDirectory(dirPath);
    if (!result.valid && result.error) {
      vscode.window.showErrorMessage(result.error);
      return false;
    }
    return true;
  }

  setupFileWatcher(dirPath: string): void {
    this.disposeFileWatcher();

    if (!dirPath) return;

    const pattern = new vscode.RelativePattern(dirPath, '**/*.json');
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

    this.fileWatcher.onDidCreate((uri) => {
      this.onFileChangeEmitter.fire({ type: 'create', uri });
    });

    this.fileWatcher.onDidChange((uri) => {
      this.onFileChangeEmitter.fire({ type: 'change', uri });
    });

    this.fileWatcher.onDidDelete((uri) => {
      this.onFileChangeEmitter.fire({ type: 'delete', uri });
    });
  }

  onConfigurationChange(callback: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('openapi-puer.apiDirectory')) {
        callback();
      }
    });
  }

  private disposeFileWatcher(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = undefined;
    }
  }

  validateFolderStructure(folderPath: string): { valid: boolean; missing: string[] } {
    const missing: string[] = [];

    // Check for .openapi-puer directory and environments.json
    const openapiPuerDir = path.join(folderPath, '.openapi-puer');
    if (!fs.existsSync(openapiPuerDir)) {
      missing.push('.openapi-puer/');
    }
    const environmentsFile = path.join(openapiPuerDir, 'environments.json');
    if (!fs.existsSync(environmentsFile)) {
      missing.push('.openapi-puer/environments.json');
    }

    // Check for components directory structure
    const componentsDir = path.join(folderPath, 'components');
    if (!fs.existsSync(componentsDir)) {
      missing.push('components/');
    }
    const parametersDir = path.join(componentsDir, 'parameters');
    if (!fs.existsSync(parametersDir)) {
      missing.push('components/parameters/');
    }
    if (!fs.existsSync(path.join(componentsDir, 'responses'))) {
      missing.push('components/responses/');
    }
    if (!fs.existsSync(path.join(componentsDir, 'requestBodies'))) {
      missing.push('components/requestBodies/');
    }
    if (!fs.existsSync(path.join(componentsDir, 'schemas'))) {
      missing.push('components/schemas/');
    }

    // Check for paths directory
    if (!fs.existsSync(path.join(folderPath, 'paths'))) {
      missing.push('paths/');
    }

    // Check for api.json
    if (!fs.existsSync(path.join(folderPath, 'api.json'))) {
      missing.push('api.json');
    }

    return {
      valid: missing.length === 0,
      missing
    };
  }

  async scaffoldFolderStructure(folderPath: string): Promise<void> {
    try {
      // Create .openapi-puer directory and environments.json
      const openapiPuerDir = path.join(folderPath, '.openapi-puer');
      if (!fs.existsSync(openapiPuerDir)) {
        fs.mkdirSync(openapiPuerDir, { recursive: true });
      }
      const environmentsFile = path.join(openapiPuerDir, 'environments.json');
      if (!fs.existsSync(environmentsFile)) {
        const defaultContent = { environments: [] };
        fs.writeFileSync(environmentsFile, JSON.stringify(defaultContent, null, 2), 'utf-8');
      }

      // Create components directory structure
      const componentsDirs = [
        path.join(folderPath, 'components', 'parameters'),
        path.join(folderPath, 'components', 'responses'),
        path.join(folderPath, 'components', 'requestBodies'),
        path.join(folderPath, 'components', 'schemas'),
      ];
      for (const dir of componentsDirs) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }

      // Create parameter definition files
      const emptyParams = { components: { parameters: {} } };
      const paramFiles = ['cookie.json', 'header.json', 'path.json', 'query.json'];
      for (const file of paramFiles) {
        const filePath = path.join(folderPath, 'components', 'parameters', file);
        if (!fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, JSON.stringify(emptyParams, null, 2), 'utf-8');
        }
      }

      // Create paths directory
      const pathsDir = path.join(folderPath, 'paths');
      if (!fs.existsSync(pathsDir)) {
        fs.mkdirSync(pathsDir, { recursive: true });
      }

      // Create api.json
      const apiJsonPath = path.join(folderPath, 'api.json');
      if (!fs.existsSync(apiJsonPath)) {
        const apiJsonContent = {
          openapi: '3.0.3',
          info: {
            title: 'My API',
            version: '1.0.0',
            description: ''
          },
          servers: [],
          paths: {}
        };
        fs.writeFileSync(apiJsonPath, JSON.stringify(apiJsonContent, null, 2), 'utf-8');
      }

      // Generate README.md if missing
      await this.generateReadme(folderPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Handle specific error types
      if (message.includes('EACCES') || message.includes('EPERM')) {
        throw new Error(`Permission denied: Cannot write to ${folderPath}. Please check folder permissions.`);
      } else if (message.includes('ENOSPC')) {
        throw new Error('Disk full: Not enough space to create files.');
      } else if (message.includes('ENAMETOOLONG')) {
        throw new Error('Path too long: The folder path exceeds the maximum length.');
      } else {
        throw new Error(`Failed to scaffold folder structure: ${message}`);
      }
    }
  }

  async generateReadme(folderPath: string): Promise<void> {
    const readmePath = path.join(folderPath, 'README.md');

    // Don't overwrite existing README
    if (fs.existsSync(readmePath)) {
      return;
    }

    try {
      const readmeContent = this.getReadmeTemplate();
      fs.writeFileSync(readmePath, readmeContent, 'utf-8');
    } catch (error) {
      // Log error but don't fail the entire scaffolding process
      console.error('Failed to generate README.md:', error);
    }
  }

  private getReadmeTemplate(): string {
    return `# OpenAPI Puer API Documentation

Welcome to your API documentation workspace! This folder is configured for use with the OpenAPI Puer VS Code extension.

## Folder Structure

\`\`\`
.
├── .openapi-puer/           # Extension configuration
│   └── environments.json    # Environment variables for API requests
├── components/              # Reusable OpenAPI components
│   ├── parameters/
│   │    ├──  cookie.json     # cookie parameter definitions
│   │    ├──  header.json     # header parameter definitions
│   │    ├──  path.json       # Reusable path parameter definitions
│   │    └──  query.json      # Reusable query parameter definitions
│   ├── responses/            # Reusable response definitions
│   ├── requestBodies/        # Reusable request body definitions
│   └── schemas/              # Reusable schema definitions
├── paths/                   # API endpoint definitions
├── api.json                 # API main file, servers, info, enviroments, etc.
├── README.md                # Readme file for API documentation
\`\`\`

### .openapi-puer/

Extension-specific configuration files:

- **environments.json**: Define environment variables (e.g., base URLs, API keys) that can be used in your API requests

### api.json

The main API specification file. Contains top-level metadata such as API info, server definitions, and global settings.

### paths/

API endpoint definitions. Each JSON file in this directory defines one or more API paths with their operations (GET, POST, PUT, DELETE, etc.).

### components/

Reusable OpenAPI components organized by type:

- **parameters/**: Reusable parameter definitions split by location
  - \`cookie.json\` — Cookie parameter definitions
  - \`header.json\` — Header parameter definitions
  - \`path.json\` — Path parameter definitions
  - \`query.json\` — Query parameter definitions
- **responses/**: Reusable response definitions
- **requestBodies/**: Reusable request body definitions
- **schemas/**: Reusable schema/model definitions

## Quick Start

1. **Browse APIs**: Use the OpenAPI Puer tree view in the sidebar to browse your API endpoints
2. **Add Endpoints**: Add new API path definitions in the \`paths/\` directory
3. **Send Requests**: Click on any endpoint to view details and send test requests
4. **Define Components**: Create reusable schemas, parameters, and responses in the \`components/\` directory
5. **Manage Environments**: Configure environment variables in \`.openapi-puer/environments.json\` for different deployment environments

## Environment Variables

Edit \`.openapi-puer/environments.json\` to define variables that can be used in your requests:

\`\`\`json
{
  "environments": [
    {
      "name": "Development",
      "variables": {
        "baseUrl": "http://localhost:3000",
        "apiKey": "dev-key-123"
      }
    },
    {
      "name": "Production",
      "variables": {
        "baseUrl": "https://api.example.com",
        "apiKey": "prod-key-456"
      }
    }
  ]
}
\`\`\`

Use variables in your requests with the \`{{variableName}}\` syntax.

## Resources

- [OpenAPI Specification](https://swagger.io/specification/)
- [VS Code Marketplace](https://marketplace.visualstudio.com/)

---

*This README was automatically generated by OpenAPI Puer. Feel free to customize it for your project.*
`;
  }

  dispose(): void {
    this.disposeFileWatcher();
    this.onFileChangeEmitter.dispose();
  }
}
