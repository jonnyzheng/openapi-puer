import * as vscode from 'vscode';
import * as path from 'path';
import { ApiEndpoint, HttpResponse, RequestConfig, WebviewMessage, SchemaObject } from '../models/types';

export class ApiPanel {
  public static currentPanel: ApiPanel | undefined;
  private static readonly viewType = 'superapi.apiPanel';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];

  private currentEndpoint: ApiEndpoint | undefined;
  private onSendRequestEmitter = new vscode.EventEmitter<RequestConfig>();
  readonly onSendRequest = this.onSendRequestEmitter.event;

  private onUpdateOverviewEmitter = new vscode.EventEmitter<{
    filePath: string;
    path: string;
    method: string;
    updates: {
      summary?: string;
      description?: string;
      operationId?: string;
      tags?: string[];
      deprecated?: boolean;
    };
  }>();
  readonly onUpdateOverview = this.onUpdateOverviewEmitter.event;

  private onUpdateParameterEmitter = new vscode.EventEmitter<{
    filePath: string;
    path: string;
    method: string;
    paramName: string;
    paramIn: string;
    field: string;
    value: unknown;
  }>();
  readonly onUpdateParameter = this.onUpdateParameterEmitter.event;

  private onAddParameterEmitter = new vscode.EventEmitter<{
    filePath: string;
    path: string;
    method: string;
    parameter: {
      name: string;
      in: string;
      type: string;
      required: boolean;
      description?: string;
    };
  }>();
  readonly onAddParameter = this.onAddParameterEmitter.event;

  private onDeleteParameterEmitter = new vscode.EventEmitter<{
    filePath: string;
    path: string;
    method: string;
    paramName: string;
    paramIn: string;
  }>();
  readonly onDeleteParameter = this.onDeleteParameterEmitter.event;

  private onDisposeEmitter = new vscode.EventEmitter<void>();
  readonly onDispose = this.onDisposeEmitter.event;

  private onUpdatePathEmitter = new vscode.EventEmitter<{
    filePath: string;
    oldPath: string;
    newPath: string;
    method: string;
  }>();
  readonly onUpdatePath = this.onUpdatePathEmitter.event;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    this.panel.webview.html = this.getHtmlContent();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this.handleMessage(message),
      null,
      this.disposables
    );
  }

  public static createOrShow(extensionUri: vscode.Uri): ApiPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (ApiPanel.currentPanel) {
      ApiPanel.currentPanel.panel.reveal(column);
      return ApiPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      ApiPanel.viewType,
      'SuperAPI',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'src', 'webview'),
          vscode.Uri.joinPath(extensionUri, 'out', 'webview'),
          vscode.Uri.joinPath(extensionUri, 'resources')
        ]
      }
    );

    // Set the panel icon (light and dark theme variants)
    panel.iconPath = {
      light: vscode.Uri.joinPath(extensionUri, 'resources', 'icon-light.svg'),
      dark: vscode.Uri.joinPath(extensionUri, 'resources', 'icon-dark.svg')
    };

    ApiPanel.currentPanel = new ApiPanel(panel, extensionUri);
    return ApiPanel.currentPanel;
  }

  public showEndpoint(
    endpoint: ApiEndpoint,
    servers: { url: string; description?: string }[],
    components?: Record<string, Record<string, SchemaObject>>
  ): void {
    this.currentEndpoint = endpoint;
    this.panel.title = `${endpoint.method.toUpperCase()} ${endpoint.path}`;

    this.postMessage({
      type: 'showEndpoint',
      payload: { endpoint, servers, components }
    });
  }

  public showResponse(response: HttpResponse): void {
    this.postMessage({
      type: 'responseReceived',
      payload: response
    });
  }

  public showError(message: string, details?: string): void {
    this.postMessage({
      type: 'error',
      payload: { message, details }
    });
  }

  public showLoading(loading: boolean): void {
    this.postMessage({
      type: 'loading',
      payload: { loading }
    });
  }

  public updateEnvironments(environments: { id: string; name: string }[], activeId?: string): void {
    this.postMessage({
      type: 'updateEnvironments',
      payload: { environments, activeId }
    });
  }

  private handleMessage(message: WebviewMessage): void {
    switch (message.type) {
      case 'sendRequest':
        this.onSendRequestEmitter.fire(message.payload as RequestConfig);
        break;
      case 'updateOverview':
        this.onUpdateOverviewEmitter.fire(message.payload as {
          filePath: string;
          path: string;
          method: string;
          updates: {
            summary?: string;
            description?: string;
            operationId?: string;
            tags?: string[];
            deprecated?: boolean;
          };
        });
        break;
      case 'updateParameter':
        this.onUpdateParameterEmitter.fire(message.payload as {
          filePath: string;
          path: string;
          method: string;
          paramName: string;
          paramIn: string;
          field: string;
          value: unknown;
        });
        break;
      case 'addParameter':
        this.onAddParameterEmitter.fire(message.payload as {
          filePath: string;
          path: string;
          method: string;
          parameter: {
            name: string;
            in: string;
            type: string;
            required: boolean;
            description?: string;
          };
        });
        break;
      case 'deleteParameter':
        console.log('ApiPanel received deleteParameter message:', message.payload);
        this.onDeleteParameterEmitter.fire(message.payload as {
          filePath: string;
          path: string;
          method: string;
          paramName: string;
          paramIn: string;
        });
        break;
      case 'updatePath':
        this.onUpdatePathEmitter.fire(message.payload as {
          filePath: string;
          oldPath: string;
          newPath: string;
          method: string;
        });
        break;
      case 'ready':
        // Webview is ready
        break;
    }
  }

  public notifyOverviewSaved(success: boolean, message?: string): void {
    this.postMessage({
      type: 'overviewSaved',
      payload: { success, message }
    });
  }

  private postMessage(message: WebviewMessage): void {
    this.panel.webview.postMessage(message);
  }

  private getHtmlContent(): string {
    const webview = this.panel.webview;

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'src', 'webview', 'styles.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'src', 'webview', 'main.js')
    );

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link href="${styleUri}" rel="stylesheet">
  <title>SuperAPI</title>
</head>
<body>
  <div id="app">
    <div id="header">
      <div id="endpoint-info">
        <span id="method-badge" class="method-badge"></span>
        <span id="endpoint-path"></span>
      </div>
      <div id="environment-selector">
        <select id="environment-select">
          <option value="">No Environment</option>
        </select>
      </div>
    </div>

    <div id="main-tabs">
      <button class="main-tab-btn active" data-main-tab="details">Details</button>
      <button class="main-tab-btn" data-main-tab="components" id="components-tab-btn" style="display: none;">Components</button>
      <button class="main-tab-btn" data-main-tab="request">Request</button>
    </div>

    <div id="content">
      <div id="details-tab" class="main-tab-content active">
        <div id="endpoint-details">
          <section id="metadata-section" class="section">
            <h3 class="section-header">Overview</h3>
            <div id="metadata-content" class="section-content"></div>
          </section>

          <section id="parameters-section" class="section">
            <h3 class="section-header collapsible">Parameters</h3>
            <div id="parameters-content" class="section-content"></div>
          </section>

          <section id="request-body-section" class="section">
            <h3 class="section-header collapsible">Request Body</h3>
            <div id="request-body-content" class="section-content"></div>
          </section>

          <section id="responses-section" class="section">
            <h3 class="section-header collapsible">Responses</h3>
            <div id="responses-content" class="section-content"></div>
          </section>
        </div>
      </div>

      <div id="components-tab" class="main-tab-content">
        <div id="components-content"></div>
      </div>

      <div id="request-tab" class="main-tab-content">
        <div id="request-builder">
          <div id="base-url-row">
            <label for="base-url">Base URL</label>
            <input type="text" id="base-url" placeholder="https://api.example.com">
          </div>

          <div id="path-params-container"></div>

          <div id="query-params-container">
            <h4>Query Parameters</h4>
            <table id="query-params-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Key</th>
                  <th>Value</th>
                  <th></th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
            <button id="add-query-param" class="add-btn">+ Add Parameter</button>
          </div>

          <div id="headers-container">
            <h4>Headers</h4>
            <table id="headers-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Key</th>
                  <th>Value</th>
                  <th></th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
            <button id="add-header" class="add-btn">+ Add Header</button>
          </div>

          <div id="body-container">
            <h4>Body</h4>
            <div id="content-type-row">
              <select id="content-type-select">
                <option value="application/json">application/json</option>
                <option value="application/x-www-form-urlencoded">application/x-www-form-urlencoded</option>
                <option value="multipart/form-data">multipart/form-data</option>
                <option value="text/plain">text/plain</option>
              </select>
              <button id="generate-body-btn">Generate from Schema</button>
            </div>
            <textarea id="body-editor" placeholder="Request body..."></textarea>
          </div>

          <div id="send-row">
            <button id="send-btn" class="primary-btn">Send</button>
            <button id="cancel-btn" class="secondary-btn" style="display: none;">Cancel</button>
            <span id="loading-indicator" style="display: none;">Sending...</span>
            <span id="elapsed-time"></span>
          </div>
        </div>

        <div id="response-viewer">
          <h3>Response</h3>
          <div id="response-status">
            <span id="status-code"></span>
            <span id="response-time"></span>
            <span id="response-size"></span>
          </div>
          <div id="response-tabs">
            <button class="tab-btn active" data-tab="body">Body</button>
            <button class="tab-btn" data-tab="headers">Headers</button>
          </div>
          <div id="response-toolbar">
            <label><input type="checkbox" id="pretty-print" checked> Pretty Print</label>
            <label><input type="checkbox" id="word-wrap"> Word Wrap</label>
            <button id="copy-response-btn">Copy</button>
            <button id="copy-curl-btn">Copy as cURL</button>
            <button id="save-response-btn">Save</button>
          </div>
          <div id="response-search">
            <input type="text" id="search-input" placeholder="Search... (Ctrl+F)">
            <span id="search-results"></span>
            <button id="search-prev">↑</button>
            <button id="search-next">↓</button>
          </div>
          <div id="response-body-tab" class="tab-content active">
            <pre id="response-body"><code></code></pre>
          </div>
          <div id="response-headers-tab" class="tab-content">
            <table id="response-headers-table">
              <tbody></tbody>
            </table>
          </div>
          <div id="no-response">Send a request to see the response</div>
        </div>
      </div>
    </div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  public dispose(): void {
    ApiPanel.currentPanel = undefined;

    // Fire dispose event before cleanup
    this.onDisposeEmitter.fire();

    this.panel.dispose();

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }

    this.onSendRequestEmitter.dispose();
    this.onUpdateOverviewEmitter.dispose();
    this.onUpdateParameterEmitter.dispose();
    this.onAddParameterEmitter.dispose();
    this.onDeleteParameterEmitter.dispose();
    this.onUpdatePathEmitter.dispose();
    this.onDisposeEmitter.dispose();
  }
}
