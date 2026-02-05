import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class ConfigService {
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private onFileChangeEmitter = new vscode.EventEmitter<{ type: 'create' | 'change' | 'delete'; uri: vscode.Uri }>();

  readonly onFileChange = this.onFileChangeEmitter.event;

  getApiDirectory(): string {
    const config = vscode.workspace.getConfiguration('superapi');
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
    const config = vscode.workspace.getConfiguration('superapi');
    const configuredPath = config.get<string>('apiDirectory', '');
    return configuredPath !== '';
  }

  async setApiDirectory(dirPath: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('superapi');
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
      if (e.affectsConfiguration('superapi.apiDirectory')) {
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

  dispose(): void {
    this.disposeFileWatcher();
    this.onFileChangeEmitter.dispose();
  }
}
