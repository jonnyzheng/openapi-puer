import * as vscode from 'vscode';
import { Environment, EnvironmentVariable } from '../models/types';
import { EnvironmentService } from '../services/EnvironmentService';

type EnvironmentEditorMessage = {
  type: string;
  payload?: unknown;
};

export class EnvironmentEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'openapi-puer.environmentsEditor';

  private inUpdateMode = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly environmentService: EnvironmentService
  ) {}

  public static register(
    context: vscode.ExtensionContext,
    environmentService: EnvironmentService
  ): vscode.Disposable {
    const provider = new EnvironmentEditorProvider(context, environmentService);
    return vscode.window.registerCustomEditorProvider(
      EnvironmentEditorProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        },
        supportsMultipleEditorsPerDocument: false
      }
    );
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview')
      ]
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    const updateWebview = () => {
      const environments = this.parseEnvironmentsFromText(document.getText());
      webviewPanel.webview.postMessage({
        type: 'documentUpdated',
        payload: {
          environments,
          activeEnvironmentId: this.environmentService.getActiveEnvironmentId()
        }
      });
    };

    const documentChangeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() !== document.uri.toString()) {
        return;
      }
      if (this.inUpdateMode) {
        return;
      }
      updateWebview();
    });

    webviewPanel.onDidDispose(() => {
      documentChangeSubscription.dispose();
    });

    webviewPanel.webview.onDidReceiveMessage(async (message: EnvironmentEditorMessage) => {
      switch (message.type) {
        case 'ready': {
          updateWebview();
          return;
        }
        case 'saveDocument': {
          const payload = message.payload as { environments?: Environment[] } | undefined;
          if (!payload || !Array.isArray(payload.environments)) {
            return;
          }
          const environments = payload.environments.map((environment) => this.normalizeEnvironment(environment));
          await this.environmentService.setEnvironments(environments, { persist: false });
          await this.updateTextDocument(document, this.environmentService.getEnvironments());
          return;
        }
        case 'setActiveEnvironment': {
          const payload = message.payload as { id?: string } | undefined;
          const id = typeof payload?.id === 'string' && payload.id.trim() ? payload.id : undefined;
          await this.environmentService.setActiveEnvironment(id);
          webviewPanel.webview.postMessage({
            type: 'activeEnvironmentChanged',
            payload: { activeEnvironmentId: this.environmentService.getActiveEnvironmentId() }
          });
          return;
        }
        case 'requestImportEnvironment': {
          await this.handleImportEnvironment(document, webviewPanel);
          return;
        }
        case 'requestExportEnvironment': {
          const payload = message.payload as { environment?: Environment } | undefined;
          if (payload?.environment) {
            await this.handleExportEnvironment(payload.environment);
          }
          return;
        }
        default:
          return;
      }
    });
  }

  private async updateTextDocument(document: vscode.TextDocument, environments: Environment[]): Promise<void> {
    const content = JSON.stringify({ environments }, null, 2);
    if (document.getText() === content) {
      return;
    }

    const edit = new vscode.WorkspaceEdit();
    const documentRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length)
    );

    edit.replace(document.uri, documentRange, content);

    this.inUpdateMode = true;
    try {
      await vscode.workspace.applyEdit(edit);
    } finally {
      this.inUpdateMode = false;
    }
  }

  private parseEnvironmentsFromText(text: string): Environment[] {
    try {
      const parsed = JSON.parse(text) as Environment[] | { environments?: Environment[] };
      const environments = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.environments)
          ? parsed.environments
          : [];
      return environments.map((environment) => this.normalizeEnvironment(environment));
    } catch {
      return [];
    }
  }

  private normalizeVariable(variable: Partial<EnvironmentVariable> | EnvironmentVariable): EnvironmentVariable {
    return {
      key: typeof variable.key === 'string' ? variable.key : '',
      value: typeof variable.value === 'string' ? variable.value : '',
      description: typeof variable.description === 'string' ? variable.description : '',
      isSecret: Boolean(variable.isSecret),
      type: variable.type === 'secret' || variable.type === 'url' || variable.type === 'text'
        ? variable.type
        : 'text'
    };
  }

  private normalizeEnvironment(environment: Partial<Environment> | Environment): Environment {
    const now = new Date().toISOString();
    const variables = Array.isArray(environment.variables)
      ? environment.variables.map((variable) => this.normalizeVariable(variable))
      : [];

    return {
      id: typeof environment.id === 'string' && environment.id.trim()
        ? environment.id
        : this.generateId(),
      name: typeof environment.name === 'string' && environment.name.trim()
        ? environment.name
        : 'Environment',
      baseUrl: typeof environment.baseUrl === 'string' ? environment.baseUrl : '',
      description: typeof environment.description === 'string' ? environment.description : '',
      variables,
      createdAt: typeof environment.createdAt === 'string' ? environment.createdAt : now,
      updatedAt: typeof environment.updatedAt === 'string' ? environment.updatedAt : now
    };
  }

  private async handleImportEnvironment(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
    const pickedFiles = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        JSON: ['json']
      },
      openLabel: 'Import Environment'
    });

    if (!pickedFiles || pickedFiles.length === 0) {
      return;
    }

    try {
      const content = await vscode.workspace.fs.readFile(pickedFiles[0]);
      const parsed = JSON.parse(Buffer.from(content).toString('utf-8')) as Partial<Environment> & {
        variables?: Partial<EnvironmentVariable>[];
      };

      if (!parsed || typeof parsed.name !== 'string' || !Array.isArray(parsed.variables)) {
        throw new Error('Invalid environment JSON format');
      }

      const current = this.parseEnvironmentsFromText(document.getText());
      const imported = this.normalizeEnvironment({
        ...parsed,
        id: this.generateUniqueEnvironmentId(current),
        name: this.generateUniqueEnvironmentName(parsed.name, current)
      });

      const next = [...current, imported];
      await this.environmentService.setEnvironments(next, { persist: false });
      const nextState = this.environmentService.getEnvironments();
      await this.updateTextDocument(document, nextState);

      webviewPanel.webview.postMessage({
        type: 'documentUpdated',
        payload: {
          environments: nextState,
          activeEnvironmentId: this.environmentService.getActiveEnvironmentId()
        }
      });

      vscode.window.showInformationMessage(`Imported environment "${imported.name}"`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to import environment: ${message}`);
    }
  }

  private async handleExportEnvironment(environment: Environment): Promise<void> {
    const suggestedFileName = `${environment.name.replace(/[^a-z0-9-_]/gi, '-').toLowerCase() || 'environment'}.json`;
    const targetUri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(suggestedFileName),
      filters: {
        JSON: ['json']
      },
      saveLabel: 'Export Environment'
    });

    if (!targetUri) {
      return;
    }

    const normalized = this.normalizeEnvironment(environment);
    const exportData = {
      name: normalized.name,
      baseUrl: normalized.baseUrl,
      description: normalized.description,
      variables: normalized.variables.map((variable) => ({
        key: variable.key,
        value: variable.isSecret ? '' : variable.value,
        description: variable.description,
        isSecret: variable.isSecret,
        type: variable.type
      }))
    };

    await vscode.workspace.fs.writeFile(
      targetUri,
      Buffer.from(JSON.stringify(exportData, null, 2), 'utf-8')
    );

    vscode.window.showInformationMessage(`Environment exported to ${targetUri.fsPath}`);
  }

  private generateId(): string {
    return `env_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  private generateUniqueEnvironmentId(existing: Environment[]): string {
    const existingIds = new Set(existing.map((environment) => environment.id));
    let id = this.generateId();
    while (existingIds.has(id)) {
      id = this.generateId();
    }
    return id;
  }

  private generateUniqueEnvironmentName(name: string, existing: Environment[]): string {
    const existingNames = new Set(existing.map((environment) => environment.name.toLowerCase()));
    if (!existingNames.has(name.toLowerCase())) {
      return name;
    }

    let index = 2;
    let candidate = `${name} (${index})`;
    while (existingNames.has(candidate.toLowerCase())) {
      index += 1;
      candidate = `${name} (${index})`;
    }
    return candidate;
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'environmentEditor.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'environmentEditor.js'));
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <link href="${cssUri}" rel="stylesheet" />
  <title>Environment Editor</title>
</head>
<body>
  <div id="env-editor">
    <header class="env-toolbar">
      <h2>Environment Management</h2>
      <div class="env-toolbar-actions">
        <button id="import-environment" class="secondary-btn" type="button">Import</button>
        <button id="export-environment" class="secondary-btn" type="button">Export</button>
      </div>
    </header>
    <main class="env-layout">
      <aside class="env-sidebar">
        <div class="env-sidebar-header">
          <h3>Environments</h3>
          <button id="add-environment" class="primary-btn" type="button">+ Add</button>
        </div>
        <ul id="environment-list" class="environment-list"></ul>
        <div id="environment-empty" class="empty-state hidden">No environments yet. Create your first environment.</div>
      </aside>
      <section id="environment-details" class="env-details"></section>
    </main>
    <div id="confirm-dialog-root"></div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i += 1) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
