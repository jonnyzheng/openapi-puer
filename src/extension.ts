import * as vscode from 'vscode';
import { OpenApiService } from './services/OpenApiService';
import { ConfigService } from './services/ConfigService';
import { HttpService } from './services/HttpService';
import { EnvironmentService } from './services/EnvironmentService';
import { ApiTreeProvider } from './providers/ApiTreeProvider';
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
  console.log('SuperAPI extension is now active!');

  // Initialize services
  openApiService = new OpenApiService();
  configService = new ConfigService();
  httpService = new HttpService();
  environmentService = new EnvironmentService(context);
  treeProvider = new ApiTreeProvider();

  // Register tree view
  const treeView = vscode.window.createTreeView('superapi.apiExplorer', {
    treeDataProvider: treeProvider,
    showCollapseAll: true
  });

  // Create status bar item for active environment
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'superapi.selectEnvironment';
  updateStatusBar();
  statusBarItem.show();

  // Register commands
  const refreshCommand = vscode.commands.registerCommand('superapi.refresh', async () => {
    await refreshApiFiles();
  });

  const openEndpointCommand = vscode.commands.registerCommand('superapi.openEndpoint', (endpoint: ApiEndpoint) => {
    openEndpointPanel(context, endpoint);
  });

  const toggleGroupByTagsCommand = vscode.commands.registerCommand('superapi.toggleGroupByTags', () => {
    treeProvider.toggleGroupByTags();
  });

  const createEnvironmentCommand = vscode.commands.registerCommand('superapi.createEnvironment', async () => {
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

  const selectEnvironmentCommand = vscode.commands.registerCommand('superapi.selectEnvironment', async () => {
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

  const editEnvironmentCommand = vscode.commands.registerCommand('superapi.editEnvironment', async () => {
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

  const setApiFolderCommand = vscode.commands.registerCommand('superapi.setApiFolder', async () => {
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
