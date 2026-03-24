import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ApiFile, ApiEndpoint, HttpMethod } from '../models/types';

export type TreeItemType = 'folder' | 'file' | 'tag' | 'endpoint';

export const OPENAPI_PUER_TREE_MIME_TYPE = 'application/vnd.code.tree.openapi-puer';

interface FolderNode {
  name: string;
  fullPath: string;
  children: Map<string, FolderNode>;
  files: ApiFile[];
  readmePath?: string;
}

export class ApiTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemType: TreeItemType,
    public readonly apiFile?: ApiFile,
    public readonly endpoint?: ApiEndpoint,
    public readonly tagName?: string,
    public readonly folderPath?: string,
    public readonly folderNode?: FolderNode
  ) {
    super(label, collapsibleState);
    this.contextValue = itemType;
  }
}

export class ApiTreeProvider implements vscode.TreeDataProvider<ApiTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ApiTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private apiFiles: ApiFile[] = [];
  private groupByTags = false;
  private apiFolderConfigured = false;
  private apiFolderNeedsSetup = false;
  private apiDirectory = '';
  private folderTree: FolderNode | null = null;

  constructor() {}

  setApiFiles(files: ApiFile[]): void {
    this.apiFiles = files;
    this.buildFolderTree();
    this.refresh();
  }

  setApiDirectory(directory: string): void {
    this.apiDirectory = directory;
  }

  setApiFolderConfigured(configured: boolean): void {
    this.apiFolderConfigured = configured;
    this.refresh();
  }

  setApiFolderNeedsSetup(needsSetup: boolean): void {
    this.apiFolderNeedsSetup = needsSetup;
    this.refresh();
  }

  setGroupByTags(enabled: boolean): void {
    this.groupByTags = enabled;
    this.refresh();
  }

  toggleGroupByTags(): void {
    this.groupByTags = !this.groupByTags;
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  private buildFolderTree(): void {
    if (!this.apiDirectory) {
      this.folderTree = null;
      return;
    }

    // Check if directory exists
    if (!fs.existsSync(this.apiDirectory)) {
      this.folderTree = null;
      return;
    }

    // Create root node
    this.folderTree = {
      name: path.basename(this.apiDirectory),
      fullPath: this.apiDirectory,
      children: new Map(),
      files: []
    };

    // Build folder structure from disk (includes empty folders)
    this.scanDirectoryForFolders(this.apiDirectory, this.folderTree);

    // Add API files to their respective folders
    for (const file of this.apiFiles) {
      const relativePath = path.relative(this.apiDirectory, file.filePath);
      const parts = relativePath.split(path.sep);

      let currentNode = this.folderTree;

      // Navigate to the folder containing this file
      for (let i = 0; i < parts.length - 1; i++) {
        const folderName = parts[i];
        if (currentNode.children.has(folderName)) {
          currentNode = currentNode.children.get(folderName)!;
        }
      }

      // Add file to current folder
      currentNode.files.push(file);
    }
  }

  private scanDirectoryForFolders(dirPath: string, parentNode: FolderNode): void {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = path.join(dirPath, entry.name);
          const childNode: FolderNode = {
            name: entry.name,
            fullPath: fullPath,
            children: new Map(),
            files: []
          };
          parentNode.children.set(entry.name, childNode);

          // Recursively scan subdirectories
          this.scanDirectoryForFolders(fullPath, childNode);
        } else if (entry.name.toLowerCase() === 'readme.md') {
          parentNode.readmePath = path.join(dirPath, entry.name);
        }
      }
    } catch (error) {
      // Ignore errors reading directories
    }
  }

  getTreeItem(element: ApiTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ApiTreeItem): Thenable<ApiTreeItem[]> {
    if (!element) {
      return Promise.resolve(this.getRootItems());
    }

    if (element.itemType === 'folder' && element.folderNode) {
      return Promise.resolve(this.getFolderChildren(element.folderNode));
    }

    if (element.itemType === 'file' && element.apiFile) {
      if (this.groupByTags) {
        return Promise.resolve(this.getTagItems(element.apiFile));
      }
      return Promise.resolve(this.getEndpointItems(element.apiFile.endpoints));
    }

    if (element.itemType === 'tag' && element.apiFile && element.tagName) {
      const endpoints = element.apiFile.endpoints.filter(
        (e) => e.tags?.includes(element.tagName!) || (!e.tags?.length && element.tagName === 'default')
      );
      return Promise.resolve(this.getEndpointItems(endpoints));
    }

    return Promise.resolve([]);
  }

  private getRootItems(): ApiTreeItem[] {
    if (!this.apiFolderConfigured) {
      return [];
    }

    if (this.apiFolderNeedsSetup) {
      return [];
    }

    if (!this.folderTree) {
      return [];
    }

    // Return children of root folder directly
    return this.getFolderChildren(this.folderTree);
  }

  private getFolderChildren(folderNode: FolderNode): ApiTreeItem[] {
    const items: ApiTreeItem[] = [];

    // Add subfolders first (sorted alphabetically)
    const sortedFolders = Array.from(folderNode.children.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );

    for (const [, childFolder] of sortedFolders) {
      const item = new ApiTreeItem(
        childFolder.name,
        vscode.TreeItemCollapsibleState.Collapsed,
        'folder',
        undefined,
        undefined,
        undefined,
        childFolder.fullPath,
        childFolder
      );
      item.iconPath = new vscode.ThemeIcon('folder');
      item.resourceUri = vscode.Uri.file(childFolder.fullPath);
      items.push(item);
    }

    // Add files (sorted alphabetically)
    const sortedFiles = [...folderNode.files].sort((a, b) =>
      a.fileName.localeCompare(b.fileName)
    );

    for (const file of sortedFiles) {
      const isParseErrorFile = !!file.parseError;
      const isApiJson = !isParseErrorFile && file.fileName.toLowerCase() === 'api.json';
      const isComponentFile = !isParseErrorFile && !isApiJson && file.endpoints.length === 0 && !!file.components;
      const hasSchemas = isComponentFile && Object.prototype.hasOwnProperty.call(file.components || {}, 'schemas');
      const hasParameters = isComponentFile && Object.prototype.hasOwnProperty.call(file.components || {}, 'parameters');
      const isParameterOnlyFile = isComponentFile && !hasSchemas && hasParameters;
      const item = new ApiTreeItem(
        file.fileName,
        (isApiJson || isComponentFile || isParseErrorFile) ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed,
        'file',
        file
      );
      item.tooltip = isParseErrorFile ? `${file.filePath}\n\n${file.parseError}` : (file.description || file.filePath);
      item.iconPath = new vscode.ThemeIcon(
        isParseErrorFile ? 'warning' : isParameterOnlyFile ? 'symbol-parameter' : isComponentFile ? 'symbol-class' : 'file-code'
      );
      item.resourceUri = vscode.Uri.file(file.filePath);
      // Set special contextValue for api.json files
      if (isParseErrorFile) {
        item.contextValue = 'file-error';
        item.command = {
          command: 'vscode.open',
          title: 'Open File',
          arguments: [vscode.Uri.file(file.filePath)]
        };
      } else if (isApiJson) {
        item.contextValue = 'file-api';
        item.command = {
          command: 'openapi-puer.openApiFile',
          title: 'Open API File',
          arguments: [file]
        };
      } else if (isComponentFile) {
        item.contextValue = isParameterOnlyFile ? 'file-parameter' : 'file-schema';
        item.command = {
          command: 'openapi-puer.openSchemaFile',
          title: 'Open Schema File',
          arguments: [file]
        };
      }
      items.push(item);
    }

    // Add README.md at the end if it exists
    if (folderNode.readmePath) {
      const readmeItem = new ApiTreeItem(
        'README.md',
        vscode.TreeItemCollapsibleState.None,
        'file'
      );
      readmeItem.iconPath = new vscode.ThemeIcon('book');
      readmeItem.contextValue = 'file-readme';
      readmeItem.resourceUri = vscode.Uri.file(folderNode.readmePath);
      readmeItem.tooltip = folderNode.readmePath;
      readmeItem.command = {
        command: 'vscode.open',
        title: 'Open README',
        arguments: [vscode.Uri.file(folderNode.readmePath)]
      };
      items.push(readmeItem);
    }

    return items;
  }

  private getTagItems(apiFile: ApiFile): ApiTreeItem[] {
    const tags = new Set<string>();
    let hasUntagged = false;

    for (const endpoint of apiFile.endpoints) {
      if (endpoint.tags && endpoint.tags.length > 0) {
        endpoint.tags.forEach((tag) => {
          tags.add(tag);
        });
      } else {
        hasUntagged = true;
      }
    }

    const items: ApiTreeItem[] = [];

    for (const tag of Array.from(tags).sort()) {
      const item = new ApiTreeItem(
        tag,
        vscode.TreeItemCollapsibleState.Collapsed,
        'tag',
        apiFile,
        undefined,
        tag
      );
      item.iconPath = new vscode.ThemeIcon('tag');
      items.push(item);
    }

    if (hasUntagged) {
      const item = new ApiTreeItem(
        'default',
        vscode.TreeItemCollapsibleState.Collapsed,
        'tag',
        apiFile,
        undefined,
        'default'
      );
      item.iconPath = new vscode.ThemeIcon('tag');
      items.push(item);
    }

    return items;
  }

  private getEndpointItems(endpoints: ApiEndpoint[]): ApiTreeItem[] {
    return endpoints.map((endpoint) => {
      // Use summary or operationId as display name, fallback to path
      const displayName = endpoint.summary || endpoint.operationId || endpoint.path;
      const label = `${endpoint.method.toUpperCase()} ${displayName}`;
      const item = new ApiTreeItem(
        label,
        vscode.TreeItemCollapsibleState.None,
        'endpoint',
        undefined,
        endpoint
      );

      // Show path in tooltip
      item.tooltip = `${endpoint.method.toUpperCase()} ${endpoint.path}${endpoint.description ? '\n\n' + endpoint.description : ''}`;
      item.iconPath = this.getMethodIcon(endpoint.method);
      item.command = {
        command: 'openapi-puer.openEndpoint',
        title: 'Open Endpoint',
        arguments: [endpoint]
      };

      if (endpoint.deprecated) {
        item.description = '(deprecated)';
      }

      return item;
    });
  }

  private getMethodIcon(method: HttpMethod): vscode.ThemeIcon {
    const colorMap: Record<HttpMethod, string> = {
      get: 'testing.iconPassed',      // green
      post: 'testing.iconQueued',     // yellow
      put: 'debugIcon.startForeground', // blue
      delete: 'testing.iconFailed',   // red
      patch: 'debugConsole.warningForeground', // orange
      head: 'symbolIcon.methodForeground',
      options: 'symbolIcon.methodForeground',
      trace: 'symbolIcon.methodForeground'
    };

    return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor(colorMap[method] || 'symbolIcon.methodForeground'));
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

export class ApiTreeDragAndDropController implements vscode.TreeDragAndDropController<ApiTreeItem> {
  readonly dropMimeTypes = [OPENAPI_PUER_TREE_MIME_TYPE];
  readonly dragMimeTypes = [OPENAPI_PUER_TREE_MIME_TYPE];

  private onDidMoveFile: ((sourcePath: string, targetPath: string) => Promise<void>) | undefined;

  setOnDidMoveFile(callback: (sourcePath: string, targetPath: string) => Promise<void>): void {
    this.onDidMoveFile = callback;
  }

  handleDrag(
    source: readonly ApiTreeItem[],
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): void | Thenable<void> {
    // Allow dragging files and folders
    const draggableItems = source.filter(item =>
      (item.itemType === 'file' && item.apiFile) || item.itemType === 'folder'
    );

    if (draggableItems.length > 0) {
      const dragData = draggableItems.map(item => ({
        type: item.itemType,
        filePath: item.resourceUri!.fsPath
      }));
      dataTransfer.set(OPENAPI_PUER_TREE_MIME_TYPE, new vscode.DataTransferItem(dragData));
    }
  }

  async handleDrop(
    target: ApiTreeItem | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const transferItem = dataTransfer.get(OPENAPI_PUER_TREE_MIME_TYPE);
    if (!transferItem) {
      return;
    }

    const dragData = transferItem.value as Array<{ type: string; filePath: string }>;
    if (!dragData || dragData.length === 0) {
      return;
    }

    // Determine target folder
    let targetFolder: string | undefined;

    if (!target) {
      // Dropped on root - not allowed without a target folder
      return;
    }

    if (target.itemType === 'folder' && target.folderPath) {
      targetFolder = target.folderPath;
    } else if (target.itemType === 'file' && target.apiFile) {
      // If dropped on a file, use the file's parent folder
      targetFolder = path.dirname(target.apiFile.filePath);
    } else {
      return;
    }

    if (!targetFolder) {
      return;
    }

    // Move each dragged item
    for (const item of dragData) {
      const sourcePath = item.filePath;
      const itemName = path.basename(sourcePath);
      const targetPath = path.join(targetFolder, itemName);

      // Don't move to the same location
      if (sourcePath === targetPath) {
        continue;
      }

      // For folders, prevent moving into itself or a descendant
      if (item.type === 'folder' && targetFolder.startsWith(sourcePath + path.sep)) {
        vscode.window.showWarningMessage(`Cannot move folder "${itemName}" into itself`);
        continue;
      }

      // Also prevent if target is the same parent
      if (path.dirname(sourcePath) === targetFolder) {
        continue;
      }

      // Don't move if target already exists
      if (fs.existsSync(targetPath)) {
        vscode.window.showWarningMessage(`"${itemName}" already exists in the target folder`);
        continue;
      }

      try {
        await fs.promises.rename(sourcePath, targetPath);

        if (this.onDidMoveFile) {
          await this.onDidMoveFile(sourcePath, targetPath);
        }

        vscode.window.showInformationMessage(`Moved "${itemName}" successfully`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to move "${itemName}": ${message}`);
      }
    }
  }
}
