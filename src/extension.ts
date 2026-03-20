import * as vscode from 'vscode';
import * as path from 'path';
import { OpenApiService } from './services/OpenApiService';
import { ConfigService } from './services/ConfigService';
import { HttpService } from './services/HttpService';
import { EnvironmentService } from './services/EnvironmentService';
import { ApiTreeProvider, ApiTreeItem, ApiTreeDragAndDropController, OPENAPI_PUER_TREE_MIME_TYPE } from './providers/ApiTreeProvider';
import { ApiPanel } from './panels/ApiPanel';
import { EnvironmentEditorProvider } from './panels/EnvironmentEditorProvider';
import { ApiEndpoint, ApiFile } from './models/types';
import { OPENAPI_DROPDOWN_VERSIONS } from './services/OpenApiVersionPolicy';

let openApiService: OpenApiService;
let configService: ConfigService;
let httpService: HttpService;
let environmentService: EnvironmentService;
let treeProvider: ApiTreeProvider;

let apiFiles: ApiFile[] = [];
let panelHandlersRegistered = false;

const ADD_ENDPOINT_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
const LAST_ADD_ENDPOINT_METHOD_KEY = 'openapi-puer.lastAddEndpointMethod';
const LAST_ADD_ENDPOINT_PATH_KEY = 'openapi-puer.lastAddEndpointPath';

export function activate(context: vscode.ExtensionContext) {
  console.log('OpenAPI Puer extension is now active!');

  // Initialize services
  openApiService = new OpenApiService();
  configService = new ConfigService();
  httpService = new HttpService();
  environmentService = new EnvironmentService(context);
  environmentService.setApiDirectory(configService.getApiDirectory() || undefined);
  const environmentEditorProvider = EnvironmentEditorProvider.register(context, environmentService);
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

            vscode.window.showInformationMessage(`Environment "${env.name}" deleted`);
          }
        }
      }
    }
  });

  const setupApiFolderCommand = vscode.commands.registerCommand('openapi-puer.setupApiFolder', async () => {
    const workspaceRoot = configService.getWorkspaceRoot();
    const defaultUri = workspaceRoot ? vscode.Uri.file(workspaceRoot) : undefined;

    const folderUri = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select API Folder',
      defaultUri,
      title: 'Select folder for your API documentation'
    });

    if (!folderUri || folderUri.length === 0) {
      return;
    }

    const selectedPath = folderUri[0].fsPath;

    if (!configService.validateAndNotify(selectedPath)) {
      return;
    }

    // Validate folder structure
    const validation = configService.validateFolderStructure(selectedPath);

    if (validation.valid) {
      // Structure is complete, just save the path
      await configService.setApiDirectory(selectedPath);
      environmentService.setApiDirectory(selectedPath);
      configService.setupFileWatcher(selectedPath);
      openApiService.clearCache();
      await refreshApiFiles();
      vscode.window.showInformationMessage(`API folder configured: ${selectedPath}`);
    } else {
      // Structure is incomplete, ask to scaffold
      const choice = await vscode.window.showInformationMessage(
        "This folder doesn't have the OpenAPI Puer structure. Create it now?",
        { modal: true },
        'Create',
        'Cancel'
      );

      if (choice === 'Create') {
        try {
          await configService.scaffoldFolderStructure(selectedPath);
          await configService.setApiDirectory(selectedPath);
          environmentService.setApiDirectory(selectedPath);
          configService.setupFileWatcher(selectedPath);
          openApiService.clearCache();
          await refreshApiFiles();
          vscode.window.showInformationMessage(`API folder configured and scaffolded: ${selectedPath}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`Failed to scaffold folder: ${message}`);
        }
      }
    }
  });

  const setupDocsStructureCommand = vscode.commands.registerCommand('openapi-puer.setupDocsStructure', async () => {
    const apiDirectory = configService.getApiDirectory();
    if (!apiDirectory) {
      vscode.window.showErrorMessage('Please set an API folder first');
      return;
    }

    if (!configService.validateAndNotify(apiDirectory)) {
      return;
    }

    const validation = configService.validateFolderStructure(apiDirectory);
    if (validation.valid) {
      vscode.window.showInformationMessage('API folder structure is already complete.');
      return;
    }

    const choice = await vscode.window.showInformationMessage(
      'Your API folder is missing required OpenAPI Puer files. Create them now?',
      { modal: true },
      'Create'
    );

    if (choice !== 'Create') {
      return;
    }

    try {
      await configService.scaffoldFolderStructure(apiDirectory);
      environmentService.setApiDirectory(apiDirectory);
      configService.setupFileWatcher(apiDirectory);
      openApiService.clearCache();
      await refreshApiFiles();
      vscode.window.showInformationMessage(`API docs structure set up in: ${apiDirectory}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to scaffold folder: ${message}`);
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
      const result = await openApiService.createFile(parentPath, fileName.trim(), apiDirectory);
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

  const renameItemCommand = vscode.commands.registerCommand('openapi-puer.renameItem', async (item?: ApiTreeItem) => {
    const targetItem = item ?? treeView.selection[0];

    if (!targetItem) {
      vscode.window.showInformationMessage('Select a file or folder in API Explorer to rename.');
      return;
    }

    let itemPath: string | undefined;
    let itemType: 'folder' | 'file' | undefined;

    if (targetItem.itemType === 'folder' && targetItem.folderPath) {
      itemPath = targetItem.folderPath;
      itemType = 'folder';
    } else if (targetItem.itemType === 'file' && targetItem.apiFile) {
      itemPath = targetItem.apiFile.filePath;
      itemType = 'file';
    }

    if (!itemPath || !itemType) {
      vscode.window.showInformationMessage('Rename is only available for files and folders.');
      return;
    }

    const currentName = path.basename(itemPath);
    const displayItemType = itemType === 'folder' ? 'Folder' : 'File';

    const newNameInput = await vscode.window.showInputBox({
      prompt: `Enter new ${itemType} name`,
      value: currentName,
      validateInput: (value) => {
        const trimmedValue = value.trim();
        if (!trimmedValue) {
          return `${displayItemType} name is required`;
        }
        if (/[<>:"/\\|?*]/.test(trimmedValue)) {
          return `${displayItemType} name contains invalid characters`;
        }
        if (trimmedValue === '.' || trimmedValue === '..') {
          return `${displayItemType} name is invalid`;
        }
        return undefined;
      }
    });

    if (newNameInput === undefined) {
      return;
    }

    const newName = newNameInput.trim();
    if (newName === currentName) {
      return;
    }

    const sourceUri = vscode.Uri.file(itemPath);
    const targetPath = path.join(path.dirname(itemPath), newName);
    const targetUri = vscode.Uri.file(targetPath);

    try {
      await vscode.workspace.fs.rename(sourceUri, targetUri, { overwrite: false });
      await refreshApiFiles();
      vscode.window.showInformationMessage(`${displayItemType} renamed to "${newName}"`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/exist/i.test(message)) {
        vscode.window.showErrorMessage(`A ${itemType} named "${newName}" already exists.`);
        return;
      }
      vscode.window.showErrorMessage(`Failed to rename ${itemType}: ${message}`);
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
    const lastMethod = context.workspaceState.get<string>(LAST_ADD_ENDPOINT_METHOD_KEY, 'get');
    const methods = [
      ...ADD_ENDPOINT_METHODS.filter(method => method === lastMethod),
      ...ADD_ENDPOINT_METHODS.filter(method => method !== lastMethod)
    ];

    // Get HTTP method
    const method = await vscode.window.showQuickPick(
      methods,
      {
        title: 'Add Endpoint (1/3)',
        placeHolder: 'Select HTTP method'
      }
    );

    if (!method) {
      return;
    }

    const lastPath = context.workspaceState.get<string>(LAST_ADD_ENDPOINT_PATH_KEY, '/');

    // Get endpoint path
    const endpointPathInput = await vscode.window.showInputBox({
      title: 'Add Endpoint (2/3)',
      prompt: 'Enter endpoint path',
      value: lastPath,
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

    if (endpointPathInput === undefined) {
      return;
    }

    const endpointPath = endpointPathInput.trim();
    const suggestedSummary = buildDefaultEndpointSummary(method, endpointPath);

    // Get summary (optional)
    const summaryInput = await vscode.window.showInputBox({
      title: 'Add Endpoint (3/3)',
      prompt: 'Enter endpoint summary (optional)',
      value: suggestedSummary,
      placeHolder: suggestedSummary
    });

    if (summaryInput === undefined) {
      return;
    }

    const summary = summaryInput.trim();

    const result = await openApiService.addEndpoint(filePath, endpointPath, method, summary || undefined);
    if (result.success) {
      await context.workspaceState.update(LAST_ADD_ENDPOINT_METHOD_KEY, method);
      await context.workspaceState.update(LAST_ADD_ENDPOINT_PATH_KEY, endpointPath);
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
      environmentService.setApiDirectory(newDirectory);
      configService.setupFileWatcher(newDirectory);
      openApiService.clearCache();
      await refreshApiFiles();
    }
  });

  // Handle environment changes
  environmentService.onEnvironmentsChange(() => {
    updatePanelEnvironments({ reloadFromDisk: false });
  });

  // Initial load - clear cache to ensure fresh parsing
  openApiService.clearCache();
  refreshApiFiles();

  // Register disposables
  context.subscriptions.push(
    treeView,
    treeView,
    refreshCommand,
    openEndpointCommand,
    toggleGroupByTagsCommand,
    createEnvironmentCommand,
    selectEnvironmentCommand,
    editEnvironmentCommand,
    setupApiFolderCommand,
    setupDocsStructureCommand,
    addFolderCommand,
    addFileCommand,
    renameItemCommand,
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
    environmentEditorProvider,
    { dispose: () => treeProvider.dispose() }
  );
}

async function refreshApiFiles(): Promise<void> {
  const apiDirectory = configService.getApiDirectory();
  const isConfigured = configService.isApiDirectoryConfigured();
  let isDirectoryValid = false;
  let needsSetup = false;

  if (apiDirectory) {
    const validation = configService.validateDirectory(apiDirectory);
    isDirectoryValid = validation.valid;
    if (isConfigured && isDirectoryValid) {
      needsSetup = !configService.validateFolderStructure(apiDirectory).valid;
    }
  }

  await vscode.commands.executeCommand('setContext', 'openapiPuer.apiFolderConfigured', isConfigured);
  await vscode.commands.executeCommand('setContext', 'openapiPuer.apiFolderNeedsSetup', needsSetup);

  treeProvider.setApiFolderConfigured(isConfigured);
  treeProvider.setApiFolderNeedsSetup(needsSetup);
  treeProvider.setApiDirectory(apiDirectory);

  if (!apiDirectory) {
    treeProvider.setApiFiles([]);
    return;
  }

  if (!isDirectoryValid) {
    treeProvider.setApiFiles([]);
    return;
  }

  if (needsSetup) {
    treeProvider.setApiFiles([]);
    return;
  }

  apiFiles = await openApiService.scanDirectory(apiDirectory);
  treeProvider.setApiFiles(apiFiles);
}

function openEndpointPanel(context: vscode.ExtensionContext, endpoint: ApiEndpoint): void {
  const panel = ApiPanel.createOrShow(context.extensionUri);

  registerPanelHandlers(panel);

  // Find the API file for this endpoint to get servers and components
  const apiFile = apiFiles.find(f => f.filePath === endpoint.filePath);
  const servers = apiFile?.servers || [];
  const components = apiFile?.components;

  panel.showEndpoint(endpoint, servers, components);
  updatePanelEnvironments();
}

function registerPanelHandlers(panel: ApiPanel): void {
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
    } finally {
      panel.showLoading(false);
    }
  });

  panel.onCopyCurl(async (config) => {
    try {
      const variables = await environmentService.getVariablesAsRecord();
      const curl = httpService.buildCurlCommand(config, variables);
      await vscode.env.clipboard.writeText(curl);
      panel.notifyOverviewSaved(true, 'cURL copied');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      panel.notifyOverviewSaved(false, message);
    }
  });

  panel.onSetActiveEnvironment(async (data) => {
    const nextId = typeof data.id === 'string' && data.id.trim() ? data.id : undefined;
    await environmentService.setActiveEnvironment(nextId);
  });

  panel.onOpenEnvironmentManager(async () => {
    await openEnvironmentManagerFile();
  });

  panel.onRequestEnvironments(() => {
    syncPanelEnvironments(panel);
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

    if (result.success) {
      await refreshApiFiles();
    }
  });

  // Handle delete parameter
  panel.onDeleteParameter(async (data) => {
    const result = await openApiService.deleteParameter(
      data.filePath,
      data.path,
      data.method,
      data.paramName,
      data.paramIn
    );

    panel.notifyOverviewSaved(result.success, result.message);

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

  // Handle add response
  panel.onAddResponse(async (data) => {
    const result = await openApiService.addResponse(
      data.filePath,
      data.path,
      data.method,
      data.response
    );

    panel.notifyOverviewSaved(result.success, result.message);

    if (result.success) {
      await refreshApiFiles();
    }
  });

  // Handle update response
  panel.onUpdateResponse(async (data) => {
    const result = await openApiService.updateResponse(
      data.filePath,
      data.path,
      data.method,
      data.statusCode,
      data.updates
    );

    panel.notifyOverviewSaved(result.success, result.message);

    if (result.success) {
      await refreshApiFiles();
    }
  });

  // Handle delete response
  panel.onDeleteResponse(async (data) => {
    const result = await openApiService.deleteResponse(
      data.filePath,
      data.path,
      data.method,
      data.statusCode
    );

    panel.notifyOverviewSaved(result.success, result.message);

    if (result.success) {
      await refreshApiFiles();
    }
  });

  // Handle reorder responses
  panel.onReorderResponses(async (data) => {
    console.log('[registerPanelHandlers] onReorderResponses received:', data);
    const result = await openApiService.reorderResponses(
      data.filePath,
      data.path,
      data.method,
      data.orderedStatusCodes
    );
    console.log('[registerPanelHandlers] reorderResponses result:', result);

    panel.notifyOverviewSaved(result.success, result.message);

    if (result.success) {
      await refreshApiFiles();
    }
  });

  // Handle update response source
  panel.onUpdateResponseSource(async (data) => {
    const result = await openApiService.updateResponseSource(
      data.filePath,
      data.path,
      data.method,
      data.statusCode,
      data.sourceJson as Record<string, unknown>
    );

    panel.notifyOverviewSaved(result.success, result.message);

    if (result.success) {
      await refreshApiFiles();
      const updatedFile = apiFiles.find(f => f.filePath === data.filePath);
      const updatedEndpoint = updatedFile?.endpoints.find(e => e.path === data.path && e.method === data.method);
      if (updatedEndpoint) {
        panel.updateEndpointData(updatedEndpoint);
      }
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

    if (result.success) {
      await refreshApiFiles();
    }
  });

  // Handle update method
  panel.onUpdateMethod(async (data) => {
    const result = await openApiService.updateMethod(
      data.filePath,
      data.path,
      data.oldMethod,
      data.newMethod
    );

    panel.notifyOverviewSaved(result.success, result.message);

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

  // Handle update API info
  panel.onUpdateApiInfo(async (data) => {
    const result = await openApiService.updateApiInfo(data.filePath, data.updates);

    panel.notifyOverviewSaved(result.success, result.message);

    if (result.success) {
      await refreshApiFiles();
    }
  });

  // Handle add schema
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

  panel.onUpdateSchemaName(async (data) => {
    const result = await openApiService.renameSchema(data.filePath, data.schemaName, data.newSchemaName);

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

  // Handle update full schema
  panel.onUpdateFullSchema(async (data) => {
    const result = await openApiService.updateFullSchema(data.filePath, data.schemaName, data.schema);

    panel.notifyOverviewSaved(result.success, result.message);

    if (result.success) {
      await refreshApiFiles();
      const updatedFile = apiFiles.find(f => f.filePath === data.filePath);
      if (updatedFile?.components) {
        panel.updateSchemas(updatedFile.components);
      }
    }
  });

  panel.onAddComponentParameter(async (data) => {
    const result = await openApiService.addComponentParameter(data.filePath, data.paramKey, data.parameter);
    panel.notifyOverviewSaved(result.success, result.message);
    if (result.success) {
      await refreshApiFiles();
      const updatedFile = apiFiles.find(f => f.filePath === data.filePath);
      if (updatedFile?.components) {
        panel.updateSchemas(updatedFile.components);
      }
    }
  });

  panel.onDeleteComponentParameter(async (data) => {
    const result = await openApiService.deleteComponentParameter(data.filePath, data.paramKey);
    panel.notifyOverviewSaved(result.success, result.message);
    if (result.success) {
      await refreshApiFiles();
      const updatedFile = apiFiles.find(f => f.filePath === data.filePath);
      if (updatedFile?.components) {
        panel.updateSchemas(updatedFile.components);
      }
    }
  });

  panel.onUpdateComponentParameter(async (data) => {
    const result = await openApiService.updateComponentParameter(data.filePath, data.paramKey, data.updates);
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

function getOpenApiVersionValue(apiFile: ApiFile): string | undefined {
  const rawSpec = apiFile.spec as { openapi?: unknown };
  return typeof rawSpec.openapi === 'string' ? rawSpec.openapi : undefined;
}

function buildDefaultEndpointSummary(method: string, endpointPath: string): string {
  const verbByMethod: Record<string, string> = {
    get: 'Get',
    post: 'Create',
    put: 'Replace',
    patch: 'Update',
    delete: 'Delete',
    head: 'Check',
    options: 'List options',
    trace: 'Trace'
  };

  const verb = verbByMethod[method.toLowerCase()] || method.toUpperCase();
  const pathText = endpointPath
    .replace(/^\/+/, '')
    .split('/')
    .filter(segment => segment.length > 0)
    .map(segment => segment.replace(/^\{(.+)\}$/, 'by $1').replace(/[-_]/g, ' '))
    .join(' ')
    .trim();

  if (!pathText) {
    return `${verb} endpoint`;
  }

  return `${verb} ${pathText}`;
}

function openApiFilePanel(context: vscode.ExtensionContext, apiFile: ApiFile): void {
  const panel = ApiPanel.createOrShow(context.extensionUri);
  registerPanelHandlers(panel);
  const isCanonicalApiFile = apiFile.fileName.toLowerCase() === 'api.json';

  panel.showApiFile({
    filePath: apiFile.filePath,
    title: apiFile.title,
    description: apiFile.description,
    version: apiFile.version,
    openapiVersion: getOpenApiVersionValue(apiFile),
    infoVersion: apiFile.spec?.info?.version,
    isCanonicalApiFile,
    supportedOpenApiVersions: OPENAPI_DROPDOWN_VERSIONS,
    servers: apiFile.servers || [],
    spec: apiFile.spec
  });

}



type PanelEnvironmentSyncOptions = {
  reloadFromDisk?: boolean;
};

export function collectPanelEnvironmentState(
  service: Pick<EnvironmentService, 'reloadEnvironmentsFromDisk' | 'getEnvironments' | 'getActiveEnvironment' | 'getActiveEnvironmentId'>,
  options: PanelEnvironmentSyncOptions = {}
) {
  if (options.reloadFromDisk !== false) {
    service.reloadEnvironmentsFromDisk();
  }

  const environments = service.getEnvironments().map(e => ({
    id: e.id,
    name: e.name
  }));
  const activeEnvironment = service.getActiveEnvironment();

  return {
    environments,
    activeEnvironmentId: service.getActiveEnvironmentId(),
    activeEnvironmentVariables: activeEnvironment?.variables || [],
    activeEnvironmentBaseUrl: activeEnvironment?.baseUrl
  };
}

function updatePanelEnvironments(options: PanelEnvironmentSyncOptions = {}): void {
  if (ApiPanel.currentPanel) {
    syncPanelEnvironments(ApiPanel.currentPanel, options);
  }
}

function syncPanelEnvironments(panel: ApiPanel, options: PanelEnvironmentSyncOptions = {}): void {
  const state = collectPanelEnvironmentState(environmentService, options);
  panel.updateEnvironments(state.environments, state.activeEnvironmentId);
  panel.updateEnvironmentVariables(state.activeEnvironmentVariables, state.activeEnvironmentBaseUrl);
}

async function openEnvironmentManagerFile(): Promise<void> {
  const apiDirectory = configService.getApiDirectory();
  const baseDir = apiDirectory || configService.getWorkspaceRoot();
  if (!baseDir) {
    vscode.window.showWarningMessage('Open a workspace folder to manage environments.');
    return;
  }

  const openapiPuerDirUri = vscode.Uri.file(path.join(baseDir, '.openapi-puer'));
  const environmentsFileUri = vscode.Uri.file(path.join(baseDir, '.openapi-puer', 'environments.json'));

  await vscode.workspace.fs.createDirectory(openapiPuerDirUri);

  try {
    await vscode.workspace.fs.stat(environmentsFileUri);
  } catch {
    const environments = environmentService.getEnvironments();
    const content = JSON.stringify({ environments }, null, 2);
    await vscode.workspace.fs.writeFile(environmentsFileUri, Buffer.from(content, 'utf-8'));
  }

  await vscode.commands.executeCommand('vscode.open', environmentsFileUri);
}

export function deactivate() {
  // Cleanup is handled by disposables
}

function openSchemaFilePanel(context: vscode.ExtensionContext, apiFile: ApiFile): void {
  const panel = ApiPanel.createOrShow(context.extensionUri);
  registerPanelHandlers(panel);

  panel.showSchemaFile({
    filePath: apiFile.filePath,
    title: apiFile.title,
    components: apiFile.components || {}
  });
}

function setupNewTabHandlers(panel: ApiPanel): void {
  panel.onSetActiveEnvironment(async (data) => {
    const nextId = typeof data.id === 'string' && data.id.trim() ? data.id : undefined;
    await environmentService.setActiveEnvironment(nextId);
  });

  panel.onOpenEnvironmentManager(async () => {
    await openEnvironmentManagerFile();
  });

  panel.onRequestEnvironments(() => {
    syncPanelEnvironments(panel);
  });

  panel.onSendRequest(async (config) => {
    panel.showLoading(true);
    try {
      const variables = await environmentService.getVariablesAsRecord();
      const response = await httpService.sendRequest(config, variables);
      panel.showResponse(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      panel.showError(message);
    } finally {
      panel.showLoading(false);
    }
  });

  panel.onCopyCurl(async (config) => {
    try {
      const variables = await environmentService.getVariablesAsRecord();
      const curl = httpService.buildCurlCommand(config, variables);
      await vscode.env.clipboard.writeText(curl);
      panel.notifyOverviewSaved(true, 'cURL copied');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      panel.notifyOverviewSaved(false, message);
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

  panel.onAddResponse(async (data) => {
    const result = await openApiService.addResponse(data.filePath, data.path, data.method, data.response);
    panel.notifyOverviewSaved(result.success, result.message);
    if (result.success) { await refreshApiFiles(); }
  });

  panel.onUpdateResponse(async (data) => {
    const result = await openApiService.updateResponse(data.filePath, data.path, data.method, data.statusCode, data.updates);
    panel.notifyOverviewSaved(result.success, result.message);
    if (result.success) { await refreshApiFiles(); }
  });

  panel.onDeleteResponse(async (data) => {
    const result = await openApiService.deleteResponse(data.filePath, data.path, data.method, data.statusCode);
    panel.notifyOverviewSaved(result.success, result.message);
    if (result.success) { await refreshApiFiles(); }
  });

  panel.onReorderResponses(async (data) => {
    console.log('[setupNewTabHandlers] onReorderResponses received:', data);
    const result = await openApiService.reorderResponses(data.filePath, data.path, data.method, data.orderedStatusCodes);
    console.log('[setupNewTabHandlers] reorderResponses result:', result);
    panel.notifyOverviewSaved(result.success, result.message);
    if (result.success) { await refreshApiFiles(); }
  });

  panel.onUpdateResponseSource(async (data) => {
    const result = await openApiService.updateResponseSource(data.filePath, data.path, data.method, data.statusCode, data.sourceJson as Record<string, unknown>);
    panel.notifyOverviewSaved(result.success, result.message);
    if (result.success) {
      await refreshApiFiles();
      const updatedFile = apiFiles.find(f => f.filePath === data.filePath);
      const updatedEndpoint = updatedFile?.endpoints.find(e => e.path === data.path && e.method === data.method);
      if (updatedEndpoint) {
        panel.updateEndpointData(updatedEndpoint);
      }
    }
  });

  panel.onUpdatePath(async (data) => {
    const result = await openApiService.updatePath(data.filePath, data.oldPath, data.newPath, data.method);
    panel.notifyOverviewSaved(result.success, result.message);
    if (result.success) { await refreshApiFiles(); }
  });

  panel.onUpdateMethod(async (data) => {
    const result = await openApiService.updateMethod(data.filePath, data.path, data.oldMethod, data.newMethod);
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

  panel.onUpdateSchemaName(async (data) => {
    const result = await openApiService.renameSchema(data.filePath, data.schemaName, data.newSchemaName);
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

  panel.onAddComponentParameter(async (data) => {
    const result = await openApiService.addComponentParameter(data.filePath, data.paramKey, data.parameter);
    panel.notifyOverviewSaved(result.success, result.message);
    if (result.success) {
      await refreshApiFiles();
      const updatedFile = apiFiles.find(f => f.filePath === data.filePath);
      if (updatedFile?.components) { panel.updateSchemas(updatedFile.components); }
    }
  });

  panel.onDeleteComponentParameter(async (data) => {
    const result = await openApiService.deleteComponentParameter(data.filePath, data.paramKey);
    panel.notifyOverviewSaved(result.success, result.message);
    if (result.success) {
      await refreshApiFiles();
      const updatedFile = apiFiles.find(f => f.filePath === data.filePath);
      if (updatedFile?.components) { panel.updateSchemas(updatedFile.components); }
    }
  });

  panel.onUpdateComponentParameter(async (data) => {
    const result = await openApiService.updateComponentParameter(data.filePath, data.paramKey, data.updates);
    panel.notifyOverviewSaved(result.success, result.message);
    if (result.success) {
      await refreshApiFiles();
      const updatedFile = apiFiles.find(f => f.filePath === data.filePath);
      if (updatedFile?.components) { panel.updateSchemas(updatedFile.components); }
    }
  });
}

function openEndpointInNewTab(context: vscode.ExtensionContext, endpoint: ApiEndpoint): void {
  const title = `${endpoint.method.toUpperCase()} ${endpoint.summary || endpoint.path}`;
  const panel = ApiPanel.createNew(context.extensionUri, title);
  setupNewTabHandlers(panel);

  const apiFile = apiFiles.find(f => f.filePath === endpoint.filePath);
  const servers = apiFile?.servers || [];
  const components = apiFile?.components;

  panel.showEndpoint(endpoint, servers, components);
  syncPanelEnvironments(panel);
}

function openApiFileInNewTab(context: vscode.ExtensionContext, apiFile: ApiFile): void {
  const title = apiFile.title || apiFile.fileName;
  const panel = ApiPanel.createNew(context.extensionUri, title);
  setupNewTabHandlers(panel);
  const isCanonicalApiFile = apiFile.fileName.toLowerCase() === 'api.json';

  panel.showApiFile({
    filePath: apiFile.filePath,
    title: apiFile.title,
    description: apiFile.description,
    version: apiFile.version,
    openapiVersion: getOpenApiVersionValue(apiFile),
    infoVersion: apiFile.spec?.info?.version,
    isCanonicalApiFile,
    supportedOpenApiVersions: OPENAPI_DROPDOWN_VERSIONS,
    servers: apiFile.servers || [],
    spec: apiFile.spec
  });
  syncPanelEnvironments(panel);
}

function openSchemaFileInNewTab(context: vscode.ExtensionContext, apiFile: ApiFile): void {
  const title = apiFile.title || apiFile.fileName;
  const panel = ApiPanel.createNew(context.extensionUri, title);
  setupNewTabHandlers(panel);

  panel.showSchemaFile({
    filePath: apiFile.filePath,
    title: apiFile.title,
    components: apiFile.components || {}
  });
  syncPanelEnvironments(panel);
}
