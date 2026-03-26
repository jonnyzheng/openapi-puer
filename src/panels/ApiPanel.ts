import * as vscode from 'vscode';
import * as path from 'path';
import {
  ApiEndpoint,
  HttpResponse,
  RequestConfig,
  WebviewMessage,
  SchemaObject,
  ServerInfo,
  EnvironmentVariable
} from '../models/types';

export class ApiPanel {
  public static currentPanel: ApiPanel | undefined;
  private static readonly viewType = 'openapi-puer.apiPanel';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];

  private currentEndpoint: ApiEndpoint | undefined;
  private onSendRequestEmitter = new vscode.EventEmitter<RequestConfig>();
  readonly onSendRequest = this.onSendRequestEmitter.event;
  private onCopyCurlEmitter = new vscode.EventEmitter<RequestConfig>();
  readonly onCopyCurl = this.onCopyCurlEmitter.event;

  private onSetActiveEnvironmentEmitter = new vscode.EventEmitter<{ id?: string }>();
  readonly onSetActiveEnvironment = this.onSetActiveEnvironmentEmitter.event;

  private onOpenEnvironmentManagerEmitter = new vscode.EventEmitter<void>();
  readonly onOpenEnvironmentManager = this.onOpenEnvironmentManagerEmitter.event;

  private onRequestEnvironmentsEmitter = new vscode.EventEmitter<void>();
  readonly onRequestEnvironments = this.onRequestEnvironmentsEmitter.event;

  private _webviewReady: boolean = false;
  private _messageQueue: WebviewMessage[] = [];

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

  private onUpdateRequestBodyEmitter = new vscode.EventEmitter<{
    filePath: string;
    path: string;
    method: string;
    requestBody: object | null;
  }>();
  readonly onUpdateRequestBody = this.onUpdateRequestBodyEmitter.event;

  // Response CRUD emitters
  private onAddResponseEmitter = new vscode.EventEmitter<{
    filePath: string;
    path: string;
    method: string;
    response: {
      statusCode: string;
      description?: string;
      contentType?: string;
      schema?: object;
    };
  }>();
  readonly onAddResponse = this.onAddResponseEmitter.event;

  private onUpdateResponseEmitter = new vscode.EventEmitter<{
    filePath: string;
    path: string;
    method: string;
    statusCode: string;
    updates: {
      statusCode?: string;
      description?: string;
      contentType?: string;
      schema?: object;
      headers?: object;
      examples?: object;
    };
  }>();
  readonly onUpdateResponse = this.onUpdateResponseEmitter.event;

  private onDeleteResponseEmitter = new vscode.EventEmitter<{
    filePath: string;
    path: string;
    method: string;
    statusCode: string;
  }>();
  readonly onDeleteResponse = this.onDeleteResponseEmitter.event;

  private onReorderResponsesEmitter = new vscode.EventEmitter<{
    filePath: string;
    path: string;
    method: string;
    orderedStatusCodes: string[];
  }>();
  readonly onReorderResponses = this.onReorderResponsesEmitter.event;

  private onUpdateResponseSourceEmitter = new vscode.EventEmitter<{
    filePath: string;
    path: string;
    method: string;
    statusCode: string;
    sourceJson: object;
  }>();
  readonly onUpdateResponseSource = this.onUpdateResponseSourceEmitter.event;

  private onDisposeEmitter = new vscode.EventEmitter<void>();
  readonly onDispose = this.onDisposeEmitter.event;

  private onUpdatePathEmitter = new vscode.EventEmitter<{
    filePath: string;
    oldPath: string;
    newPath: string;
    method: string;
  }>();
  readonly onUpdatePath = this.onUpdatePathEmitter.event;

  private onUpdateMethodEmitter = new vscode.EventEmitter<{
    filePath: string;
    path: string;
    oldMethod: string;
    newMethod: string;
  }>();
  readonly onUpdateMethod = this.onUpdateMethodEmitter.event;

  private onAddServerEmitter = new vscode.EventEmitter<{
    filePath: string;
    server: { url: string; description?: string };
  }>();
  readonly onAddServer = this.onAddServerEmitter.event;

  private onUpdateServerEmitter = new vscode.EventEmitter<{
    filePath: string;
    index: number;
    server: { url: string; description?: string };
  }>();
  readonly onUpdateServer = this.onUpdateServerEmitter.event;

  private onDeleteServerEmitter = new vscode.EventEmitter<{
    filePath: string;
    index: number;
  }>();
  readonly onDeleteServer = this.onDeleteServerEmitter.event;

  private onUpdateApiInfoEmitter = new vscode.EventEmitter<{
    filePath: string;
    updates: {
      title?: string;
      description?: string;
      version?: string;
      openapiVersion?: string;
    };
  }>();
  readonly onUpdateApiInfo = this.onUpdateApiInfoEmitter.event;

  private onAddSchemaEmitter = new vscode.EventEmitter<{
    filePath: string;
    schemaName: string;
    schemaType: string;
  }>();
  readonly onAddSchema = this.onAddSchemaEmitter.event;

  private onDeleteSchemaEmitter = new vscode.EventEmitter<{
    filePath: string;
    schemaName: string;
  }>();
  readonly onDeleteSchema = this.onDeleteSchemaEmitter.event;

  private onAddSchemaPropertyEmitter = new vscode.EventEmitter<{
    filePath: string;
    schemaName: string;
    property: {
      name: string; type: string; description?: string; required?: boolean;
      format?: string; example?: unknown; default?: unknown; enum?: unknown[];
      nullable?: boolean; deprecated?: boolean; readOnly?: boolean; writeOnly?: boolean;
      pattern?: string; minLength?: number; maxLength?: number;
      minimum?: number; maximum?: number; exclusiveMinimum?: boolean | number; exclusiveMaximum?: boolean | number;
      minItems?: number; maxItems?: number; uniqueItems?: boolean;
    };
  }>();
  readonly onAddSchemaProperty = this.onAddSchemaPropertyEmitter.event;

  private onDeleteSchemaPropertyEmitter = new vscode.EventEmitter<{
    filePath: string;
    schemaName: string;
    propertyName: string;
  }>();
  readonly onDeleteSchemaProperty = this.onDeleteSchemaPropertyEmitter.event;

  private onUpdateSchemaPropertyEmitter = new vscode.EventEmitter<{
    filePath: string;
    schemaName: string;
    propertyName: string;
    updates: {
      name?: string; type?: string; description?: string; required?: boolean;
      format?: string | null; example?: unknown | null; default?: unknown | null; enum?: unknown[] | null;
      nullable?: boolean | null; deprecated?: boolean | null; readOnly?: boolean | null; writeOnly?: boolean | null;
      pattern?: string | null; minLength?: number | null; maxLength?: number | null;
      minimum?: number | null; maximum?: number | null; exclusiveMinimum?: boolean | number | null; exclusiveMaximum?: boolean | number | null;
      minItems?: number | null; maxItems?: number | null; uniqueItems?: boolean | null;
    };
  }>();
  readonly onUpdateSchemaProperty = this.onUpdateSchemaPropertyEmitter.event;

  private onUpdateFullSchemaEmitter = new vscode.EventEmitter<{
    filePath: string;
    schemaName: string;
    schema: Record<string, unknown>;
  }>();
  readonly onUpdateFullSchema = this.onUpdateFullSchemaEmitter.event;

  private onUpdateSchemaNameEmitter = new vscode.EventEmitter<{
    filePath: string;
    schemaName: string;
    newSchemaName: string;
  }>();
  readonly onUpdateSchemaName = this.onUpdateSchemaNameEmitter.event;

  private onAddComponentParameterEmitter = new vscode.EventEmitter<{
    filePath: string;
    paramKey: string;
    parameter: { name: string; in: string; type: string; required?: boolean; description?: string; example?: unknown; deprecated?: boolean; format?: string };
  }>();
  readonly onAddComponentParameter = this.onAddComponentParameterEmitter.event;

  private onDeleteComponentParameterEmitter = new vscode.EventEmitter<{
    filePath: string;
    paramKey: string;
  }>();
  readonly onDeleteComponentParameter = this.onDeleteComponentParameterEmitter.event;

  private onUpdateComponentParameterEmitter = new vscode.EventEmitter<{
    filePath: string;
    paramKey: string;
    updates: Record<string, unknown>;
  }>();
  readonly onUpdateComponentParameter = this.onUpdateComponentParameterEmitter.event;

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
      'OpenAPI Puer',
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

  public static createNew(extensionUri: vscode.Uri, title?: string): ApiPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : vscode.ViewColumn.One;

    const panel = vscode.window.createWebviewPanel(
      ApiPanel.viewType,
      title || 'OpenAPI Puer',
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

    panel.iconPath = {
      light: vscode.Uri.joinPath(extensionUri, 'resources', 'icon-light.svg'),
      dark: vscode.Uri.joinPath(extensionUri, 'resources', 'icon-dark.svg')
    };

    return new ApiPanel(panel, extensionUri);
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

  public updateEnvironmentVariables(variables: EnvironmentVariable[], activeBaseUrl?: string): void {
    this.postMessage({
      type: 'updateEnvironmentVariables',
      payload: {
        variables: variables.map((variable) => ({
          key: variable.key,
          value: variable.value,
          description: variable.description,
          isSecret: variable.isSecret,
          type: variable.type
        })),
        activeBaseUrl: activeBaseUrl || ''
      }
    });
  }

  public showAddServerDialog(
    filePath: string,
    servers: { url: string; description?: string }[]
  ): void {
    this.panel.title = 'Add Server';
    this.postMessage({
      type: 'showAddServer',
      payload: { filePath, servers }
    });
  }

  public showApiFile(apiFile: {
    filePath: string;
    title?: string;
    description?: string;
    version: string;
    openapiVersion?: string;
    infoVersion?: string;
    isCanonicalApiFile?: boolean;
    supportedOpenApiVersions?: ReadonlyArray<string>;
    servers: ServerInfo[];
    spec?: unknown;
  }): void {
    this.panel.title = apiFile.title || 'API Info';
    this.postMessage({
      type: 'showApiFile',
      payload: apiFile
    });
  }

  public showSchemaFile(schemaFile: {
    filePath: string;
    title?: string;
    components: Record<string, Record<string, SchemaObject>>;
  }): void {
    this.panel.title = schemaFile.title || 'Schemas';
    this.postMessage({
      type: 'showSchemaFile',
      payload: schemaFile
    });
  }

  private handleMessage(message: WebviewMessage): void {
    switch (message.type) {
      case 'sendRequest':
        this.onSendRequestEmitter.fire(message.payload as RequestConfig);
        break;
      case 'copyCurl':
        this.onCopyCurlEmitter.fire(message.payload as RequestConfig);
        break;
      case 'setActiveEnvironment':
        this.onSetActiveEnvironmentEmitter.fire(message.payload as { id?: string });
        break;
      case 'openEnvironmentManager':
        this.onOpenEnvironmentManagerEmitter.fire();
        break;
      case 'requestEnvironments':
        this.onRequestEnvironmentsEmitter.fire();
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
      case 'updateMethod':
        this.onUpdateMethodEmitter.fire(message.payload as {
          filePath: string;
          path: string;
          oldMethod: string;
          newMethod: string;
        });
        break;
      case 'updateRequestBody':
        this.onUpdateRequestBodyEmitter.fire(message.payload as {
          filePath: string;
          path: string;
          method: string;
          requestBody: object | null;
        });
        break;
      case 'addResponse':
        this.onAddResponseEmitter.fire(message.payload as {
          filePath: string;
          path: string;
          method: string;
          response: {
            statusCode: string;
            description?: string;
            contentType?: string;
            schema?: object;
          };
        });
        break;
      case 'updateResponse':
        this.onUpdateResponseEmitter.fire(message.payload as {
          filePath: string;
          path: string;
          method: string;
          statusCode: string;
          updates: {
            statusCode?: string;
            description?: string;
            contentType?: string;
            schema?: object;
            headers?: object;
            examples?: object;
          };
        });
        break;
      case 'deleteResponse':
        this.onDeleteResponseEmitter.fire(message.payload as {
          filePath: string;
          path: string;
          method: string;
          statusCode: string;
        });
        break;
      case 'reorderResponses':
        this.onReorderResponsesEmitter.fire(message.payload as {
          filePath: string;
          path: string;
          method: string;
          orderedStatusCodes: string[];
        });
        break;
      case 'updateResponseSource':
        this.onUpdateResponseSourceEmitter.fire(message.payload as {
          filePath: string;
          path: string;
          method: string;
          statusCode: string;
          sourceJson: object;
        });
        break;
      case 'addServer':
        this.onAddServerEmitter.fire(message.payload as {
          filePath: string;
          server: { url: string; description?: string };
        });
        break;
      case 'updateServer':
        this.onUpdateServerEmitter.fire(message.payload as {
          filePath: string;
          index: number;
          server: { url: string; description?: string };
        });
        break;
      case 'deleteServer':
        this.onDeleteServerEmitter.fire(message.payload as {
          filePath: string;
          index: number;
        });
        break;
      case 'updateApiInfo':
        this.onUpdateApiInfoEmitter.fire(message.payload as {
          filePath: string;
          updates: {
            title?: string;
            description?: string;
            version?: string;
            openapiVersion?: string;
          };
        });
        break;
      case 'addSchema':
        this.onAddSchemaEmitter.fire(message.payload as {
          filePath: string;
          schemaName: string;
          schemaType: string;
        });
        break;
      case 'deleteSchema':
        this.onDeleteSchemaEmitter.fire(message.payload as {
          filePath: string;
          schemaName: string;
        });
        break;
      case 'addSchemaProperty':
        this.onAddSchemaPropertyEmitter.fire(message.payload as {
          filePath: string;
          schemaName: string;
          property: {
            name: string; type: string; description?: string; required?: boolean;
            format?: string; example?: unknown; default?: unknown; enum?: unknown[];
            nullable?: boolean; deprecated?: boolean; readOnly?: boolean; writeOnly?: boolean;
            pattern?: string; minLength?: number; maxLength?: number;
            minimum?: number; maximum?: number;
          };
        });
        break;
      case 'deleteSchemaProperty':
        this.onDeleteSchemaPropertyEmitter.fire(message.payload as {
          filePath: string;
          schemaName: string;
          propertyName: string;
        });
        break;
      case 'updateSchemaProperty':
        this.onUpdateSchemaPropertyEmitter.fire(message.payload as {
          filePath: string;
          schemaName: string;
          propertyName: string;
          updates: {
            name?: string; type?: string; description?: string; required?: boolean;
            format?: string | null; example?: unknown | null; default?: unknown | null; enum?: unknown[] | null;
            nullable?: boolean | null; deprecated?: boolean | null; readOnly?: boolean | null; writeOnly?: boolean | null;
            pattern?: string | null; minLength?: number | null; maxLength?: number | null;
            minimum?: number | null; maximum?: number | null;
          };
        });
        break;
      case 'updateFullSchema':
        this.onUpdateFullSchemaEmitter.fire(message.payload as {
          filePath: string;
          schemaName: string;
          schema: Record<string, unknown>;
        });
        break;
      case 'updateSchemaName':
        this.onUpdateSchemaNameEmitter.fire(message.payload as {
          filePath: string;
          schemaName: string;
          newSchemaName: string;
        });
        break;
      case 'addComponentParameter':
        this.onAddComponentParameterEmitter.fire(message.payload as {
          filePath: string;
          paramKey: string;
          parameter: { name: string; in: string; type: string; required?: boolean; description?: string; example?: unknown; deprecated?: boolean; format?: string };
        });
        break;
      case 'deleteComponentParameter':
        this.onDeleteComponentParameterEmitter.fire(message.payload as {
          filePath: string;
          paramKey: string;
        });
        break;
      case 'updateComponentParameter':
        this.onUpdateComponentParameterEmitter.fire(message.payload as {
          filePath: string;
          paramKey: string;
          updates: Record<string, unknown>;
        });
        break;
      case 'ready':
        this._webviewReady = true;
        this._flushMessageQueue();
        break;
    }
  }

  public notifyOverviewSaved(success: boolean, message?: string): void {
    this.postMessage({
      type: 'overviewSaved',
      payload: { success, message }
    });
  }

  public updateServers(servers: { url: string; description?: string }[]): void {
    this.postMessage({
      type: 'updateServers',
      payload: { servers }
    });
  }

  public updateSchemas(components: Record<string, Record<string, SchemaObject>>): void {
    this.postMessage({
      type: 'updateSchemas',
      payload: { components }
    });
  }
  public updateEndpointData(endpoint: ApiEndpoint): void {
    this.currentEndpoint = endpoint;
    this.postMessage({
      type: 'updateEndpointData',
      payload: { endpoint }
    });
  }


  public postMessagePublic(message: WebviewMessage): void {
    this.postMessage(message);
  }

  private postMessage(message: WebviewMessage): void {
    if (this._webviewReady) {
      this.panel.webview.postMessage(message);
    } else {
      this._messageQueue.push(message);
    }
  }

  private _flushMessageQueue(): void {
    while (this._messageQueue.length > 0) {
      const message = this._messageQueue.shift();
      if (message) {
        this.panel.webview.postMessage(message);
      }
    }
  }

  private getHtmlContent(): string {
    const webview = this.panel.webview;
    const webviewAssetRoot = vscode.Uri.joinPath(this.extensionUri, 'out', 'webview');

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewAssetRoot, 'styles.css')
    );
    const tailwindUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewAssetRoot, 'tailwind.css')
    );
    const prismCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewAssetRoot, 'prism', 'themes', 'prism-tomorrow.css')
    );
    const prismJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewAssetRoot, 'prism', 'prism.js')
    );
    const prismJsonUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewAssetRoot, 'prism', 'components', 'prism-json.min.js')
    );
    const utilsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewAssetRoot, 'utils.js')
    );
    const schemaTableUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewAssetRoot, 'schemaTable.js')
    );
    const detailsTabUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewAssetRoot, 'detailsTab.js')
    );
    const requestTabUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewAssetRoot, 'requestTab.js')
    );
    const componentsTabUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewAssetRoot, 'componentsTab.js')
    );
    const serversTabUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewAssetRoot, 'serversTab.js')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewAssetRoot, 'main.js')
    );

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link href="${prismCssUri}" rel="stylesheet">
  <link href="${styleUri}" rel="stylesheet">
  <link href="${tailwindUri}" rel="stylesheet">
  <title>OpenAPI Puer</title>
</head>
<body>
  <div id="app">
    <div id="header">
      <div id="endpoint-info">
        <span id="method-badge" class="method-badge"></span>
        <span id="endpoint-path"></span><span id="query-params-preview"></span>
        <span id="parameter-type-labels"></span>
      </div>
      <div id="environment-selector">
        <select id="environment-select">
          <option value="">No Environment</option>
        </select>
        <button id="manage-environments-btn" type="button">Manage</button>
      </div>
    </div>

    <div id="main-tabs">
      <button class="main-tab-btn active" data-main-tab="details">Details</button>
      <button class="main-tab-btn" data-main-tab="components" id="components-tab-btn" style="display: none;">Components</button>
      <button class="main-tab-btn" data-main-tab="servers" id="servers-tab-btn" style="display: none;">Servers</button>
      <button class="main-tab-btn" data-main-tab="request">Request</button>
    </div>

    <div id="content">
      <div id="details-tab" class="main-tab-content active">
        <div id="endpoint-details">
          <section id="metadata-section" class="section">
            <h3 class="section-header">Overview</h3>
            <div id="metadata-content" class="section-content"></div>
          </section>

          <section id="definition-section" class="section">
            <div id="definition-tabs" class="definition-tabs">
              <button class="definition-tab-btn active" data-def-tab="params">Params</button>
              <button class="definition-tab-btn" data-def-tab="body">Body</button>
              <button class="definition-tab-btn" data-def-tab="headers">Headers</button>
              <button class="definition-tab-btn" data-def-tab="cookies">Cookies</button>
            </div>
            <div id="def-params-tab" class="definition-tab-content active"></div>
            <div id="def-body-tab" class="definition-tab-content"></div>
            <div id="def-headers-tab" class="definition-tab-content"></div>
            <div id="def-cookies-tab" class="definition-tab-content"></div>
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

      <div id="servers-tab" class="main-tab-content">
        <div id="servers-content"></div>
      </div>

      <div id="request-tab" class="main-tab-content">
        <div id="request-builder">
          <div id="base-url-row">
            <div id="base-url-path-line">
              <input type="text" id="base-url" placeholder="{{baseUrl}}/path/to/endpoint">
              <button id="send-btn" class="primary-btn">Send</button>
              <button id="cancel-btn" class="secondary-btn" style="display: none;">Cancel</button>
              <span id="loading-indicator" style="display: none;">Sending...</span>
            </div>
            <div id="request-validation-message" style="display:none; margin-top:6px; padding:6px 8px; border-radius:4px; border:1px solid var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground)); background:var(--vscode-inputValidation-errorBackground, rgba(244, 71, 71, 0.15)); color:var(--vscode-errorForeground); font-size:12px;"></div>
          </div>
          <div id="request-tabs" class="request-tabs">
            <button class="request-tab-btn active" data-req-tab="params">Params</button>
            <button class="request-tab-btn" data-req-tab="body">Body</button>
            <button class="request-tab-btn" data-req-tab="headers">Headers</button>
            <button class="request-tab-btn" data-req-tab="auth">Auth</button>
            <button class="request-tab-btn" data-req-tab="cookies">Cookies</button>
            <button class="request-tab-btn" data-req-tab="settings">Settings</button>
          </div>

          <div id="req-params-tab" class="request-tab-content active">
            <div id="req-path-params"></div>
            <table id="req-query-params-table" class="request-param-table">
              <thead>
                <tr>
                  <th class="req-col-check"></th>
                  <th class="req-col-key">Key</th>
                  <th class="req-col-value">Value</th>
                  <th class="req-col-type">Type</th>
                  <th class="req-col-action"></th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
            <button id="add-query-param" class="add-btn">+ Add Parameter</button>
          </div>

          <div id="req-body-tab" class="request-tab-content"></div>

          <div id="req-headers-tab" class="request-tab-content">
            <table id="req-headers-table" class="request-param-table">
              <thead>
                <tr>
                  <th class="req-col-check"></th>
                  <th class="req-col-key">Key</th>
                  <th class="req-col-value">Value</th>
                  <th class="req-col-type">Type</th>
                  <th class="req-col-action"></th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
            <button id="add-header" class="add-btn">+ Add Header</button>
          </div>

          <div id="req-auth-tab" class="request-tab-content">
            <div class="auth-row" style="display:flex; align-items:center; gap:8px;">
              <label for="req-auth-type" style="min-width:100px; font-size:12px; color:var(--vscode-descriptionForeground);">Type</label>
              <select id="req-auth-type" style="flex:1;">
                <option value="none">No Auth</option>
                <option value="bearer">Bearer Token</option>
                <option value="basic">Basic Auth</option>
                <option value="api-key">API Key</option>
              </select>
            </div>
            <div id="req-auth-fields" style="display:flex; flex-direction:column; gap:8px;"></div>
          </div>

          <div id="req-cookies-tab" class="request-tab-content">
            <table id="req-cookies-table" class="request-param-table">
              <thead>
                <tr>
                  <th class="req-col-check"></th>
                  <th class="req-col-key">Key</th>
                  <th class="req-col-value">Value</th>
                  <th class="req-col-type">Type</th>
                  <th class="req-col-action"></th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
            <button id="add-cookie" class="add-btn">+ Add Cookie</button>
          </div>

          <div id="req-settings-tab" class="request-tab-content">
            <div class="request-setting-row">
              <label for="req-timeout-ms">Timeout (ms)</label>
              <input type="number" id="req-timeout-ms" min="1" step="100" value="30000">
            </div>
          </div>

        </div>

        <div id="response-viewer">
          <div id="response-header-row">
            <h3>Response</h3>
            <div id="response-status">
              <span id="status-code"></span>
              <span id="response-time"></span>
              <span id="response-size"></span>
            </div>
          </div>
          <div id="response-tabs">
            <button class="tab-btn active" data-tab="body">Body</button>
            <button class="tab-btn" data-tab="headers">Headers</button>
            <button class="tab-btn" data-tab="cookies">Cookies</button>
          </div>
          <div id="response-toolbar">
            <label><input type="checkbox" id="pretty-print" checked> Pretty Print</label>
            <label><input type="checkbox" id="word-wrap"> Word Wrap</label>
            <div id="response-action-buttons">
              <button id="copy-response-btn" class="response-copy-btn">Copy</button>
              <button id="copy-curl-btn" class="response-copy-btn">Copy as cURL</button>
              <button id="save-response-btn">Save to example</button>
            </div>
          </div>
          <div id="response-body-tab" class="tab-content active">
            <pre id="response-body"><code></code></pre>
          </div>
          <div id="response-headers-tab" class="tab-content">
            <table id="response-headers-table">
              <tbody></tbody>
            </table>
          </div>
          <div id="response-cookies-tab" class="tab-content">
            <table id="response-cookies-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Value</th>
                  <th>Domain</th>
                  <th>Path</th>
                  <th>Expires</th>
                  <th>HttpOnly</th>
                  <th>Secure</th>
                  <th>SameSite</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
            <div id="no-cookies" class="no-params-message" style="text-align:center; padding:12px;">No cookies in response</div>
          </div>
          <div id="no-response">Send a request to see the response</div>
        </div>
      </div>
    </div>
  </div>

  <script nonce="${nonce}" src="${prismJsUri}"></script>
  <script nonce="${nonce}" src="${prismJsonUri}"></script>
  <script nonce="${nonce}" src="${utilsUri}"></script>
  <script nonce="${nonce}" src="${schemaTableUri}"></script>
  <script nonce="${nonce}" src="${detailsTabUri}"></script>
  <script nonce="${nonce}" src="${requestTabUri}"></script>
  <script nonce="${nonce}" src="${componentsTabUri}"></script>
  <script nonce="${nonce}" src="${serversTabUri}"></script>
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
    this.onCopyCurlEmitter.dispose();
    this.onSetActiveEnvironmentEmitter.dispose();
    this.onOpenEnvironmentManagerEmitter.dispose();
    this.onRequestEnvironmentsEmitter.dispose();
    this.onUpdateOverviewEmitter.dispose();
    this.onUpdateParameterEmitter.dispose();
    this.onAddParameterEmitter.dispose();
    this.onDeleteParameterEmitter.dispose();
    this.onUpdateRequestBodyEmitter.dispose();
    this.onAddResponseEmitter.dispose();
    this.onUpdateResponseEmitter.dispose();
    this.onDeleteResponseEmitter.dispose();
    this.onReorderResponsesEmitter.dispose();
    this.onUpdateResponseSourceEmitter.dispose();
    this.onUpdatePathEmitter.dispose();
    this.onAddServerEmitter.dispose();
    this.onUpdateServerEmitter.dispose();
    this.onDeleteServerEmitter.dispose();
    this.onDisposeEmitter.dispose();
  }
}
