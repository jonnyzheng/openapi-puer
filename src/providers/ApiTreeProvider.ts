import * as vscode from 'vscode';
import * as path from 'path';
import { ApiFile, ApiEndpoint, HttpMethod } from '../models/types';

export type TreeItemType = 'folder' | 'file' | 'tag' | 'endpoint';

interface FolderNode {
  name: string;
  fullPath: string;
  children: Map<string, FolderNode>;
  files: ApiFile[];
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
    if (!this.apiDirectory || this.apiFiles.length === 0) {
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

    for (const file of this.apiFiles) {
      const relativePath = path.relative(this.apiDirectory, file.filePath);
      const parts = relativePath.split(path.sep);

      let currentNode = this.folderTree;

      // Navigate/create folder structure
      for (let i = 0; i < parts.length - 1; i++) {
        const folderName = parts[i];
        if (!currentNode.children.has(folderName)) {
          const folderPath = path.join(this.apiDirectory, ...parts.slice(0, i + 1));
          currentNode.children.set(folderName, {
            name: folderName,
            fullPath: folderPath,
            children: new Map(),
            files: []
          });
        }
        currentNode = currentNode.children.get(folderName)!;
      }

      // Add file to current folder
      currentNode.files.push(file);
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
    // Return empty array when no API folder is configured to show welcome view
    if (!this.apiFolderConfigured) {
      return [];
    }

    if (this.apiFiles.length === 0) {
      const emptyItem = new ApiTreeItem(
        'No OpenAPI files found',
        vscode.TreeItemCollapsibleState.None,
        'file'
      );
      emptyItem.iconPath = new vscode.ThemeIcon('info');
      return [emptyItem];
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
      (a.title || a.fileName).localeCompare(b.title || b.fileName)
    );

    for (const file of sortedFiles) {
      const item = new ApiTreeItem(
        file.title || file.fileName,
        vscode.TreeItemCollapsibleState.Collapsed,
        'file',
        file
      );
      item.tooltip = file.description || file.filePath;
      item.iconPath = new vscode.ThemeIcon('file-code');
      item.resourceUri = vscode.Uri.file(file.filePath);
      items.push(item);
    }

    return items;
  }

  private getTagItems(apiFile: ApiFile): ApiTreeItem[] {
    const tags = new Set<string>();
    let hasUntagged = false;

    for (const endpoint of apiFile.endpoints) {
      if (endpoint.tags && endpoint.tags.length > 0) {
        endpoint.tags.forEach((tag) => tags.add(tag));
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
      const label = `${endpoint.method.toUpperCase()} ${endpoint.path}`;
      const item = new ApiTreeItem(
        label,
        vscode.TreeItemCollapsibleState.None,
        'endpoint',
        undefined,
        endpoint
      );

      item.tooltip = endpoint.summary || endpoint.description || endpoint.path;
      item.iconPath = this.getMethodIcon(endpoint.method);
      item.command = {
        command: 'superapi.openEndpoint',
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
