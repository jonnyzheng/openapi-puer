import * as vscode from 'vscode';
import * as path from 'path';
import { OpenApiService } from './services/OpenApiService';
import { ConfigService } from './services/ConfigService';
import { HttpService } from './services/HttpService';
import { EnvironmentService } from './services/EnvironmentService';
import { ApiTreeProvider, ApiTreeItem, ApiTreeDragAndDropController, OPENAPI_PUER_TREE_MIME_TYPE } from './providers/ApiTreeProvider';
import { ApiPanel } from './panels/ApiPanel';
import { ApiEndpoint, ApiFile } from './models/types';

let openApiService: OpenApiService;
let configService: ConfigService;
let httpService: HttpService;
let environmentService: EnvironmentService;
let treeProvider: ApiTreeProvider;
let statusBarItem: vscode.StatusBarItem;
let apiFiles: ApiFile[] = [];
let panelHandlersRegistered = false;

export function activate(context: vscode.ExtensionContext) {
  console.log('OpenAPI Puer extension is now active!');

  // Initialize services
  openApiService = new OpenApiService();
  configService = new ConfigService();
  httpService = new HttpService();
  environmentService = new EnvironmentService(context);
  treeProvider = new ApiTreeProvider();

  // Create drag and drop controller
  const dragAndDropController = new ApiTreeDragAndDropController();
  dragAndDropController.setOnDidMoveFile(async (sourcePath, targetPath) => {
    openApiService.removeFromCache(sourcePath);
    await refreshApiFiles();
  });

  // Register tree view
  const treeView = vscode.window.createTreeView('openapi-puer.apiExplorer', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
    dragAndDropController: dragAndDropController
  });

  // Create status bar item for active environment
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'openapi-puer.selectEnvironment';
  updateStatusBar();
  statusBarItem.show();

  // Register commands
  const refreshCommand = vscode.commands.registerCommand('openapi-puer.refresh', async () => {
    await refreshApiFiles();
  });

  const openEndpointCommand = vscode.commands.registerCommand('openapi-puer.openEndpoint', (endpoint: ApiEndpoint) => {
    openEndpointPanel(context, endpoint);
  });

  const toggleGroupByTagsCommand = vscode.commands.registerCommand('openapi-puer.toggleGroupByTags', () => {
    treeProvider.toggleGroupByTags();
  });

  const createEnvironmentCommand = vscode.commands.registerCommand('openapi-puer.createEnvironment', async () => {
    const name = await vscode.window.showInputBox({
      prompt: 'Enter environment name',
      placeHolder: 'e.g., Development, Staging, Production'
    });

    if (name) {
      await environmentService.createEnvironment(name);
      updateStatusBar();
      vscode.window.showInformationMessage(`Environment "${name}" created`);
    }
  });

  const selectEnvironmentCommand = vscode.commands.registerCommand('openapi-puer.selectEnvironment', async () => {
    const environments = environmentService.getEnvironments();
    const items: vscode.QuickPickItem[] = [
      { label: 'No Environment', description: 'Clear active environment' },
      ...environments.map(env => ({
        label: env.name,
        description: env.id === environmentService.getActiveEnvironmentId() ? '(active)' : ''
      }))
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select an environment'
    });

    if (selected) {
      if (selected.label === 'No Environment') {
        await environmentService.setActiveEnvironment(undefined);
      } else {
        const env = environments.find(e => e.name === selected.label);
        if (env) {
          await environmentService.setActiveEnvironment(env.id);
        }
      }
      updateStatusBar();
      updatePanelEnvironments();
    }
  });

  const editEnvironmentCommand = vscode.commands.registerCommand('openapi-puer.editEnvironment', async () => {
    const environments = environmentService.getEnvironments();
    if (environments.length === 0) {
      vscode.window.showInformationMessage('No environments to edit. Create one first.');
      return;
    }

    const items = environments.map(env => ({
      label: env.name,
      description: `${env.variables.length} variables`
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select environment to edit'
    });

    if (selected) {
      const env = environments.find(e => e.name === selected.label);
      if (env) {
        // For now, show a simple input for adding variables
        const action = await vscode.window.showQuickPick([
          { label: 'Add Variable', description: 'Add a new variable' },
          { label: 'Rename', description: 'Rename this environment' },
          { label: 'Delete', description: 'Delete this environment' }
        ], {
          placeHolder: `Edit "${env.name}"`
        });

        if (action?.label === 'Add Variable') {
          const key = await vscode.window.showInputBox({ prompt: 'Variable name' });
          if (key) {
            const value = await vscode.window.showInputBox({ prompt: 'Variable value' });
            if (value !== undefined) {
              await environmentService.addVariable(env.id, { key, value });
              vscode.window.showInformationMessage(`Variable "${key}" added`);
            }
          }
        } else if (action?.label === 'Rename') {
          const newName = await vscode.window.showInputBox({
            prompt: 'New name',
            value: env.name
          });
          if (newName && newName !== env.name) {
            await environmentService.updateEnvironment(env.id, { name: newName });
            updateStatusBar();
            vscode.window.showInformationMessage(`Environment renamed to "${newName}"`);
          }
        } else if (action?.label === 'Delete') {
          const confirm = await vscode.window.showWarningMessage(
            `Delete environment "${env.name}"?`,
            { modal: true },
            'Delete'
          );
          if (confirm === 'Delete') {
            await environmentService.deleteEnvironment(env.id);
            updateStatusBar();
            vscode.window.showInformationMessage(`Environment "${env.name}" deleted`);
          }
        }
      }
    }
  });

  const setApiFolderCommand = vscode.commands.registerCommand('openapi-puer.setApiFolder', async () => {
    const workspaceRoot = configService.getWorkspaceRoot();
    const defaultUri = workspaceRoot ? vscode.Uri.file(workspaceRoot) : undefined;

    const folderUri = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select API Folder',
      defaultUri,
      title: 'Select folder containing OpenAPI specification files'
    });

    if (folderUri && folderUri.length > 0) {
      const selectedPath = folderUri[0].fsPath;

      if (!configService.validateAndNotify(selectedPath)) {
        return;
      }

      await configService.setApiDirectory(selectedPath);
      configService.setupFileWatcher(selectedPath);
      openApiService.clearCache();
      await refreshApiFiles();

      vscode.window.showInformationMessage(`API folder set to: ${selectedPath}`);
    }
  });

  const addFolderCommand = vscode.commands.registerCommand('openapi-puer.addFolder', async (item?: ApiTreeItem) => {
    const apiDirectory = configService.getApiDirectory();
    if (!apiDirectory) {
      vscode.window.showErrorMessage('Please set an API folder first');
      return;
    }

    // Determine parent path
    let parentPath: string;
    if (item && item.itemType === 'folder' && item.folderPath) {
      parentPath = item.folderPath;
    } else {
      parentPath = apiDirectory;
    }

    const folderName = await vscode.window.showInputBox({
      prompt: 'Enter folder name',
      placeHolder: 'e.g., users, orders, auth',
      validateInput: (value) => {
        if (!value || value.trim() === '') {
          return 'Folder name is required';
        }
        if (/[<>:"/\\|?*]/.test(value)) {
          return 'Folder name contains invalid characters';
        }
        return undefined;
      }
    });

    if (folderName) {
      const result = await openApiService.createFolder(parentPath, folderName.trim());
      if (result.success) {
        vscode.window.showInformationMessage(`Folder "${folderName}" created`);
        await refreshApiFiles();
      } else {
        vscode.window.showErrorMessage(result.message || 'Failed to create folder');
      }
    }
  });

  const addFileCommand = vscode.commands.registerCommand('openapi-puer.addFile', async (item?: ApiTreeItem) => {
    const apiDirectory = configService.getApiDirectory();
    if (!apiDirectory) {
      vscode.window.showErrorMessage('Please set an API folder first');
      return;
    }

    // Determine parent path
    let parentPath: string;
    if (item && item.itemType === 'folder' && item.folderPath) {
      parentPath = item.folderPath;
    } else {
      parentPath = apiDirectory;
    }

    const fileName = await vscode.window.showInputBox({
      prompt: 'Enter file name',
      placeHolder: 'e.g., users-api, orders, auth (will add .json extension)',
      validateInput: (value) => {
        if (!value || value.trim() === '') {
          return 'File name is required';
        }
        if (/[<>:"/\\|?*]/.test(value)) {
          return 'File name contains invalid characters';
        }
        return undefined;
      }
    });

    if (fileName) {
      const result = await openApiService.createFile(parentPath, fileName.trim());
      if (result.success) {
        vscode.window.showInformationMessage(`File "${fileName}.json" created`);
        await refreshApiFiles();

        // Open the newly created file in editor
        if (result.path) {
          const doc = await vscode.workspace.openTextDocument(result.path);
          await vscode.window.showTextDocument(doc);
        }
      } else {
        vscode.window.showErrorMessage(result.message || 'Failed to create file');
      }
    }
  });

  const deleteItemCommand = vscode.commands.registerCommand('openapi-puer.deleteItem', async (item?: ApiTreeItem) => {
    if (!item) {
      return;
    }

    let itemPath: string | undefined;
    let itemName: string = '';
    let itemType: string = '';

    if (item.itemType === 'folder' && item.folderPath) {
      itemPath = item.folderPath;
      itemName = path.basename(item.folderPath);
      itemType = 'folder';
    } else if (item.itemType === 'file' && item.apiFile) {
      itemPath = item.apiFile.filePath;
      itemName = item.apiFile.fileName;
      itemType = 'file';
    }

    if (!itemPath) {
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Delete ${itemType} "${itemName}"?${itemType === 'folder' ? ' This will delete all contents.' : ''}`,
      { modal: true },
      'Delete'
    );

    if (confirm === 'Delete') {
      const result = await openApiService.deleteItem(itemPath);
      if (result.success) {
        vscode.window.showInformationMessage(`${itemType} "${itemName}" deleted`);
        await refreshApiFiles();
      } else {
        vscode.window.showErrorMessage(result.message || `Failed to delete ${itemType}`);
      }
    }
  });

  const viewSourceCodeCommand = vscode.commands.registerCommand('openapi-puer.viewSourceCode', async (item?: ApiTreeItem) => {
    if (!item || item.itemType !== 'file' || !item.apiFile) {
      return;
    }

    const filePath = item.apiFile.filePath;
    try {
      const doc = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(doc);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open file: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  const addEndpointCommand = vscode.commands.registerCommand('openapi-puer.addEndpoint', async (item?: ApiTreeItem) => {
    if (!item || item.itemType !== 'file' || !item.apiFile) {
      return;
    }

    const filePath = item.apiFile.filePath;

    // Get HTTP method
    const method = await vscode.window.showQuickPick(
      ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'],
      { placeHolder: 'Select HTTP method' }
    );

    if (!method) {
      return;
    }

    // Get endpoint path
    const endpointPath = await vscode.window.showInputBox({
      prompt: 'Enter endpoint path',
      placeHolder: 'e.g., /users, /users/{id}, /orders/{orderId}/items',
      validateInput: (value) => {
        if (!value || value.trim() === '') {
          return 'Endpoint path is required';
        }
        if (!value.startsWith('/')) {
          return 'Endpoint path must start with /';
        }
        return undefined;
      }
    });

    if (!endpointPath) {
      return;
    }

    // Get summary (optional)
    const summary = await vscode.window.showInputBox({
      prompt: 'Enter endpoint summary (optional)',
      placeHolder: 'e.g., Get all users, Create a new order'
    });

    const result = await openApiService.addEndpoint(filePath, endpointPath.trim(), method, summary?.trim());
    if (result.success) {
      vscode.window.showInformationMessage(`Endpoint ${method.toUpperCase()} ${endpointPath} added`);
      await refreshApiFiles();
    } else {
      vscode.window.showErrorMessage(result.message || 'Failed to add endpoint');
    }
  });

  const addModelCommand = vscode.commands.registerCommand('openapi-puer.addModel', async (item?: ApiTreeItem) => {
    if (!item || !item.apiFile) {
      return;
    }

    // Open the schema file panel and trigger the add schema dialog
    openSchemaFilePanel(context, item.apiFile);

    // Wait briefly for the panel to be ready, then trigger the add schema dialog
    const panel = ApiPanel.createOrShow(context.extensionUri);
    panel.postMessagePublic({ type: 'showAddSchemaDialog' });
  });

  const addServerCommand = vscode.commands.registerCommand('openapi-puer.addServer', async (item?: ApiTreeItem) => {
    if (!item || !item.apiFile) {
      return;
    }

    const filePath = item.apiFile.filePath;

    // Get the servers from the API file
    const apiFile = await openApiService.parseFile(filePath);
    if (!apiFile) {
      vscode.window.showErrorMessage('Failed to parse API file');
      return;
    }

    const servers = apiFile.servers || [];

    // Create or show the panel and display the server management view
    const panel = ApiPanel.createOrShow(context.extensionUri);

    // Setup event handlers for server operations
    panel.onAddServer(async (data) => {
      const result = await openApiService.addServer(data.filePath, data.server);
      if (result.success) {
        vscode.window.showInformationMessage('Server added successfully');
        // Refresh and update the panel
        const updatedFile = await openApiService.parseFile(data.filePath);
        if (updatedFile) {
          panel.showAddServerDialog(data.filePath, updatedFile.servers || []);
        }
        await refreshApiFiles();
      } else {
        vscode.window.showErrorMessage(result.message || 'Failed to add server');
      }
    });

    panel.onUpdateServer(async (data) => {
      const result = await openApiService.updateServer(data.filePath, data.index, data.server);
      if (result.success) {
        vscode.window.showInformationMessage('Server updated successfully');
        // Refresh and update the panel
        const updatedFile = await openApiService.parseFile(data.filePath);
        if (updatedFile) {
          panel.showAddServerDialog(data.filePath, updatedFile.servers || []);
        }
        await refreshApiFiles();
      } else {
        vscode.window.showErrorMessage(result.message || 'Failed to update server');
      }
    });

    panel.onDeleteServer(async (data) => {
      const result = await openApiService.deleteServer(data.filePath, data.index);
      if (result.success) {
        vscode.window.showInformationMessage('Server deleted successfully');
        // Refresh and update the panel
        const updatedFile = await openApiService.parseFile(data.filePath);
        if (updatedFile) {
          panel.showAddServerDialog(data.filePath, updatedFile.servers || []);
        }
        await refreshApiFiles();
      } else {
        vscode.window.showErrorMessage(result.message || 'Failed to delete server');
      }
    });

    // Show the server management dialog
    panel.showAddServerDialog(filePath, servers);
  });

  const openApiFileCommand = vscode.commands.registerCommand('openapi-puer.openApiFile', (apiFile: ApiFile) => {
    openApiFilePanel(context, apiFile);
  });

  const openSchemaFileCommand = vscode.commands.registerCommand('openapi-puer.openSchemaFile', (apiFile: ApiFile) => {
    openSchemaFilePanel(context, apiFile);
  });

  const openInNewTabCommand = vscode.commands.registerCommand('openapi-puer.openInNewTab', (treeItem: ApiTreeItem) => {
    if (treeItem.itemType === 'endpoint' && treeItem.endpoint) {
      openEndpointInNewTab(context, treeItem.endpoint);
    } else if (treeItem.apiFile) {
      const file = treeItem.apiFile;
      const isApiJson = file.fileName.toLowerCase() === 'api.json';
      const isSchemaFile = !isApiJson && file.endpoints.length === 0 && !!file.components;
      if (isApiJson) {
        openApiFileInNewTab(context, file);
      } else if (isSchemaFile) {
        openSchemaFileInNewTab(context, file);
      }
    }
  });

  // Setup file watcher
  const apiDirectory = configService.getApiDirectory();
  if (apiDirectory && configService.validateDirectory(apiDirectory).valid) {
    configService.setupFileWatcher(apiDirectory);
  }

  // Handle file changes
  configService.onFileChange(async (event) => {
    if (event.type === 'delete') {
      openApiService.removeFromCache(event.uri.fsPath);
    }
    await refreshApiFiles();
  });

  // Handle configuration changes
  const configChangeDisposable = configService.onConfigurationChange(async () => {
    const newDirectory = configService.getApiDirectory();
    if (newDirectory && configService.validateAndNotify(newDirectory)) {
      configService.setupFileWatcher(newDirectory);
      openApiService.clearCache();
      await refreshApiFiles();
    }
  });

  // Handle environment changes
  environmentService.onEnvironmentsChange(() => {
    updatePanelEnvironments();
  });

  // Initial load - clear cache to ensure fresh parsing
  openApiService.clearCache();
  refreshApiFiles();

  // Register disposables
  context.subscriptions.push(
    treeView,
    statusBarItem,
    refreshCommand,
    openEndpointCommand,
    toggleGroupByTagsCommand,
    createEnvironmentCommand,
    selectEnvironmentCommand,
    editEnvironmentCommand,
    setApiFolderCommand,
    addFolderCommand,
    addFileCommand,
    deleteItemCommand,
    viewSourceCodeCommand,
    addEndpointCommand,
    addModelCommand,
    addServerCommand,
    openApiFileCommand,
    openSchemaFileCommand,
    openInNewTabCommand,
    configChangeDisposable,
    { dispose: () => openApiService.dispose() },
    { dispose: () => configService.dispose() },
    { dispose: () => environmentService.dispose() },
    { dispose: () => treeProvider.dispose() }
  );
}

async function refreshApiFiles(): Promise<void> {
  const apiDirectory = configService.getApiDirectory();
  const isConfigured = configService.isApiDirectoryConfigured();

  treeProvider.setApiFolderConfigured(isConfigured);
  treeProvider.setApiDirectory(apiDirectory);

  if (!apiDirectory) {
    treeProvider.setApiFiles([]);
    return;
  }

  if (!configService.validateDirectory(apiDirectory).valid) {
    treeProvider.setApiFiles([]);
    return;
  }

  apiFiles = await openApiService.scanDirectory(apiDirectory);
  treeProvider.setApiFiles(apiFiles);
}

function openEndpointPanel(context: vscode.ExtensionContext, endpoint: ApiEndpoint): void {
  const panel = ApiPanel.createOrShow(context.extensionUri);

  // Find the API file for this endpoint to get servers and components
  const apiFile = apiFiles.find(f => f.filePath === endpoint.filePath);
  const servers = apiFile?.servers || [];
  const components = apiFile?.components;

  panel.showEndpoint(endpoint, servers, components);
  updatePanelEnvironments();

  // Only register handlers once
  if (panelHandlersRegistered) {
    return;
  }
  panelHandlersRegistered = true;

  // Handle send request
  panel.onSendRequest(async (config) => {
    panel.showLoading(true);

    try {
      const variables = await environmentService.getVariablesAsRecord();
      const response = await httpService.sendRequest(config, variables);
      panel.showResponse(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      panel.showError(message);
    }
  });

  // Handle update overview
  panel.onUpdateOverview(async (data) => {
    const result = await openApiService.updateEndpointOverview(
      data.filePath,
      data.path,
      data.method,
      data.updates
    );

    panel.notifyOverviewSaved(result.success, result.message);

    // Refresh the tree view if save was successful
    if (result.success) {
      await refreshApiFiles();
    }
  });

  // Handle update parameter
  panel.onUpdateParameter(async (data) => {
    const result = await openApiService.updateParameter(
      data.filePath,
      data.path,
      data.method,
      data.paramName,
      data.paramIn,
      data.field,
      data.value
    );

    panel.notifyOverviewSaved(result.success, result.message);

    // Refresh the tree view if save was successful
    if (result.success) {
      await refreshApiFiles();
    }
  });

  // Handle add parameter
  panel.onAddParameter(async (data) => {
    const result = await openApiService.addParameter(
      data.filePath,
      data.path,
      data.method,
      data.parameter
    );

    panel.notifyOverviewSaved(result.success, result.message);

    // Refresh the tree view if save was successful
    if (result.success) {
      await refreshApiFiles();
    }
  });

  // Handle delete parameter
  panel.onDeleteParameter(async (data) => {
    console.log('Extension received onDeleteParameter event:', data);
    const result = await openApiService.deleteParameter(
      data.filePath,
      data.path,
      data.method,
      data.paramName,
      data.paramIn
    );

    console.log('deleteParameter result:', result);
    panel.notifyOverviewSaved(result.success, result.message);

    // Refresh the tree view if save was successful
    if (result.success) {
      await refreshApiFiles();
    }
  });

  // Handle update request body
  panel.onUpdateRequestBody(async (data) => {
    const result = await openApiService.updateRequestBody(
      data.filePath,
      data.path,
      data.method,
      data.requestBody
    );

    panel.notifyOverviewSaved(result.success, result.message);

    if (result.success) {
      await refreshApiFiles();
    }
  });

  // Handle update path
  panel.onUpdatePath(async (data) => {
    const result = await openApiService.updatePath(
      data.filePath,
      data.oldPath,
      data.newPath,
      data.method
    );

    panel.notifyOverviewSaved(result.success, result.message);

    // Refresh the tree view if save was successful
    if (result.success) {
      await refreshApiFiles();
    }
  });

  // Handle add server
  panel.onAddServer(async (data) => {
    const result = await openApiService.addServer(
      data.filePath,
      data.server
    );

    panel.notifyOverviewSaved(result.success, result.message);

    if (result.success && result.servers) {
      panel.updateServers(result.servers);
      await refreshApiFiles();
    }
  });

  // Handle update server
  panel.onUpdateServer(async (data) => {
    const result = await openApiService.updateServer(
      data.filePath,
      data.index,
      data.server
    );

    panel.notifyOverviewSaved(result.success, result.message);

    if (result.success && result.servers) {
      panel.updateServers(result.servers);
      await refreshApiFiles();
    }
  });

  // Handle delete server
  panel.onDeleteServer(async (data) => {
    const result = await openApiService.deleteServer(
      data.filePath,
      data.index
    );

    panel.notifyOverviewSaved(result.success, result.message);

    if (result.success) {
      panel.updateServers(result.servers || []);
      await refreshApiFiles();
    }
  });

  // Reset flag when panel is disposed
  panel.onDispose(() => {
    panelHandlersRegistered = false;
  });
}

function openApiFilePanel(context: vscode.ExtensionContext, apiFile: ApiFile): void {
  const panel = ApiPanel.createOrShow(context.extensionUri);

  panel.showApiFile({
    filePath: apiFile.filePath,
    title: apiFile.title,
    description: apiFile.description,
    version: apiFile.version,
    infoVersion: apiFile.spec?.info?.version,
    servers: apiFile.servers || [],
    spec: apiFile.spec
  });

  // Only register handlers once
  if (panelHandlersRegistered) {
    return;
  }
  panelHandlersRegistered = true;

  // Handle update API info
  panel.onUpdateApiInfo(async (data) => {
    const result = await openApiService.updateApiInfo(data.filePath, data.updates);

    panel.notifyOverviewSaved(result.success, result.message);

    if (result.success) {
      await refreshApiFiles();
    }
  });

  // Handle add server
  panel.onAddServer(async (data) => {
    const result = await openApiService.addServer(data.filePath, data.server);

    panel.notifyOverviewSaved(result.success, result.message);

    if (result.success && result.servers) {
      panel.updateServers(result.servers);
      await refreshApiFiles();
    }
  });

  // Handle update server
  panel.onUpdateServer(async (data) => {
    const result = await openApiService.updateServer(data.filePath, data.index, data.server);

    panel.notifyOverviewSaved(result.success, result.message);

    if (result.success && result.servers) {
      panel.updateServers(result.servers);
      await refreshApiFiles();
    }
  });

  // Handle delete server
  panel.onDeleteServer(async (data) => {
    const result = await openApiService.deleteServer(data.filePath, data.index);

    panel.notifyOverviewSaved(result.success, result.message);

    if (result.success) {
      panel.updateServers(result.servers || []);
      await refreshApiFiles();
    }
  });

  // Reset flag when panel is disposed
  panel.onDispose(() => {
    panelHandlersRegistered = false;
  });
}

function updateStatusBar(): void {
  const activeEnv = environmentService.getActiveEnvironment();
  if (activeEnv) {
    statusBarItem.text = `$(globe) ${activeEnv.name}`;
    statusBarItem.tooltip = `Active environment: ${activeEnv.name}\nClick to change`;
  } else {
    statusBarItem.text = '$(globe) No Environment';
    statusBarItem.tooltip = 'Click to select an environment';
  }
}

function updatePanelEnvironments(): void {
  if (ApiPanel.currentPanel) {
    const environments = environmentService.getEnvironments().map(e => ({
      id: e.id,
      name: e.name
    }));
    ApiPanel.currentPanel.updateEnvironments(environments, environmentService.getActiveEnvironmentId());
  }
}

export function deactivate() {
  // Cleanup is handled by disposables
}

function openSchemaFilePanel(context: vscode.ExtensionContext, apiFile: ApiFile): void {
  const panel = ApiPanel.createOrShow(context.extensionUri);

  panel.showSchemaFile({
    filePath: apiFile.filePath,
    title: apiFile.title,
    components: apiFile.components || {}
  });

  // Only register handlers once
  if (panelHandlersRegistered) {
    return;
  }
  panelHandlersRegistered = true;

  // Handle add schema (reuses existing addModel)
  panel.onAddSchema(async (data) => {
    const result = await openApiService.addModel(data.filePath, data.schemaName, data.schemaType);

    panel.notifyOverviewSaved(result.success, result.message);

    if (result.success) {
      await refreshApiFiles();
      const updatedFile = apiFiles.find(f => f.filePath === data.filePath);
      if (updatedFile?.components) {
        panel.updateSchemas(updatedFile.components);
      }
    }
  });

  // Handle delete schema
  panel.onDeleteSchema(async (data) => {
    const result = await openApiService.deleteSchema(data.filePath, data.schemaName);

    panel.notifyOverviewSaved(result.success, result.message);

    if (result.success) {
      await refreshApiFiles();
      const updatedFile = apiFiles.find(f => f.filePath === data.filePath);
      if (updatedFile?.components) {
        panel.updateSchemas(updatedFile.components);
      }
    }
  });

  // Handle add schema property
  panel.onAddSchemaProperty(async (data) => {
    const result = await openApiService.addSchemaProperty(data.filePath, data.schemaName, data.property);

    panel.notifyOverviewSaved(result.success, result.message);

    if (result.success) {
      await refreshApiFiles();
      const updatedFile = apiFiles.find(f => f.filePath === data.filePath);
      if (updatedFile?.components) {
        panel.updateSchemas(updatedFile.components);
      }
    }
  });

  // Handle delete schema property
  panel.onDeleteSchemaProperty(async (data) => {
    const result = await openApiService.deleteSchemaProperty(data.filePath, data.schemaName, data.propertyName);

    panel.notifyOverviewSaved(result.success, result.message);

    if (result.success) {
      await refreshApiFiles();
      const updatedFile = apiFiles.find(f => f.filePath === data.filePath);
      if (updatedFile?.components) {
        panel.updateSchemas(updatedFile.components);
      }
    }
  });

  // Handle update schema property
  panel.onUpdateSchemaProperty(async (data) => {
    const result = await openApiService.updateSchemaProperty(data.filePath, data.schemaName, data.propertyName, data.updates);

    panel.notifyOverviewSaved(result.success, result.message);

    if (result.success) {
      await refreshApiFiles();
      const updatedFile = apiFiles.find(f => f.filePath === data.filePath);
      if (updatedFile?.components) {
        panel.updateSchemas(updatedFile.components);
      }
    }
  });

  // Reset flag when panel is disposed
  panel.onDispose(() => {
    panelHandlersRegistered = false;
  });
}

function setupNewTabHandlers(panel: ApiPanel): void {
  panel.onSendRequest(async (config) => {
    panel.showLoading(true);
    try {
      const variables = await environmentService.getVariablesAsRecord();
      const response = await httpService.sendRequest(config, variables);
      panel.showResponse(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      panel.showError(message);
    }
  });

  panel.onUpdateOverview(async (data) => {
    const result = await openApiService.updateEndpointOverview(data.filePath, data.path, data.method, data.updates);
    panel.notifyOverviewSaved(result.success, result.message);
    if (result.success) { await refreshApiFiles(); }
  });

  panel.onUpdateParameter(async (data) => {
    const result = await openApiService.updateParameter(data.filePath, data.path, data.method, data.paramName, data.paramIn, data.field, data.value);
    panel.notifyOverviewSaved(result.success, result.message);
    if (result.success) { await refreshApiFiles(); }
  });

  panel.onAddParameter(async (data) => {
    const result = await openApiService.addParameter(data.filePath, data.path, data.method, data.parameter);
    panel.notifyOverviewSaved(result.success, result.message);
    if (result.success) { await refreshApiFiles(); }
  });

  panel.onDeleteParameter(async (data) => {
    const result = await openApiService.deleteParameter(data.filePath, data.path, data.method, data.paramName, data.paramIn);
    panel.notifyOverviewSaved(result.success, result.message);
    if (result.success) { await refreshApiFiles(); }
  });

  panel.onUpdateRequestBody(async (data) => {
    const result = await openApiService.updateRequestBody(data.filePath, data.path, data.method, data.requestBody);
    panel.notifyOverviewSaved(result.success, result.message);
    if (result.success) { await refreshApiFiles(); }
  });

  panel.onUpdatePath(async (data) => {
    const result = await openApiService.updatePath(data.filePath, data.oldPath, data.newPath, data.method);
    panel.notifyOverviewSaved(result.success, result.message);
    if (result.success) { await refreshApiFiles(); }
  });

  panel.onAddSchema(async (data) => {
    const result = await openApiService.addModel(data.filePath, data.schemaName, data.schemaType);
    panel.notifyOverviewSaved(result.success, result.message);
    if (result.success) {
      await refreshApiFiles();
      const updatedFile = apiFiles.find(f => f.filePath === data.filePath);
      if (updatedFile?.components) { panel.updateSchemas(updatedFile.components); }
    }
  });

  panel.onDeleteSchema(async (data) => {
    const result = await openApiService.deleteSchema(data.filePath, data.schemaName);
    panel.notifyOverviewSaved(result.success, result.message);
    if (result.success) {
      await refreshApiFiles();
      const updatedFile = apiFiles.find(f => f.filePath === data.filePath);
      if (updatedFile?.components) { panel.updateSchemas(updatedFile.components); }
    }
  });

  panel.onAddSchemaProperty(async (data) => {
    const result = await openApiService.addSchemaProperty(data.filePath, data.schemaName, data.property);
    panel.notifyOverviewSaved(result.success, result.message);
    if (result.success) {
      await refreshApiFiles();
      const updatedFile = apiFiles.find(f => f.filePath === data.filePath);
      if (updatedFile?.components) { panel.updateSchemas(updatedFile.components); }
    }
  });

  panel.onDeleteSchemaProperty(async (data) => {
    const result = await openApiService.deleteSchemaProperty(data.filePath, data.schemaName, data.propertyName);
    panel.notifyOverviewSaved(result.success, result.message);
    if (result.success) {
      await refreshApiFiles();
      const updatedFile = apiFiles.find(f => f.filePath === data.filePath);
      if (updatedFile?.components) { panel.updateSchemas(updatedFile.components); }
    }
  });

  panel.onUpdateSchemaProperty(async (data) => {
    const result = await openApiService.updateSchemaProperty(data.filePath, data.schemaName, data.propertyName, data.updates);
    panel.notifyOverviewSaved(result.success, result.message);
    if (result.success) {
      await refreshApiFiles();
      const updatedFile = apiFiles.find(f => f.filePath === data.filePath);
      if (updatedFile?.components) { panel.updateSchemas(updatedFile.components); }
    }
  });

  panel.onUpdateApiInfo(async (data) => {
    const result = await openApiService.updateApiInfo(data.filePath, data.updates);
    panel.notifyOverviewSaved(result.success, result.message);
    if (result.success) { await refreshApiFiles(); }
  });

  panel.onAddServer(async (data) => {
    const result = await openApiService.addServer(data.filePath, data.server);
    panel.notifyOverviewSaved(result.success, result.message);
    if (result.success && result.servers) {
      panel.updateServers(result.servers);
      await refreshApiFiles();
    }
  });

  panel.onUpdateServer(async (data) => {
    const result = await openApiService.updateServer(data.filePath, data.index, data.server);
    panel.notifyOverviewSaved(result.success, result.message);
    if (result.success && result.servers) {
      panel.updateServers(result.servers);
      await refreshApiFiles();
    }
  });

  panel.onDeleteServer(async (data) => {
    const result = await openApiService.deleteServer(data.filePath, data.index);
    panel.notifyOverviewSaved(result.success, result.message);
    if (result.success) {
      panel.updateServers(result.servers || []);
      await refreshApiFiles();
    }
  });
}

function openEndpointInNewTab(context: vscode.ExtensionContext, endpoint: ApiEndpoint): void {
  const title = `${endpoint.method.toUpperCase()} ${endpoint.summary || endpoint.path}`;
  const panel = ApiPanel.createNew(context.extensionUri, title);

  const apiFile = apiFiles.find(f => f.filePath === endpoint.filePath);
  const servers = apiFile?.servers || [];
  const components = apiFile?.components;

  panel.showEndpoint(endpoint, servers, components);
  setupNewTabHandlers(panel);
}

function openApiFileInNewTab(context: vscode.ExtensionContext, apiFile: ApiFile): void {
  const title = apiFile.title || apiFile.fileName;
  const panel = ApiPanel.createNew(context.extensionUri, title);

  panel.showApiFile({
    filePath: apiFile.filePath,
    title: apiFile.title,
    description: apiFile.description,
    version: apiFile.version,
    infoVersion: apiFile.spec?.info?.version,
    servers: apiFile.servers || [],
    spec: apiFile.spec
  });
  setupNewTabHandlers(panel);
}

function openSchemaFileInNewTab(context: vscode.ExtensionContext, apiFile: ApiFile): void {
  const title = apiFile.title || apiFile.fileName;
  const panel = ApiPanel.createNew(context.extensionUri, title);

  panel.showSchemaFile({
    filePath: apiFile.filePath,
    title: apiFile.title,
    components: apiFile.components || {}
  });
  setupNewTabHandlers(panel);
}
