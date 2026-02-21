// OpenAPI Puer webview entry point
// Depends on: utils.js, detailsTab.js, requestTab.js, componentsTab.js, serversTab.js
(function() {
  const S = window.OpenAPIPuer;

  // Save the initial endpoint HTML so it can be restored when switching back from api/schema views
  S._initialAppHtml = document.getElementById('app').innerHTML;

  S.restoreEndpointView = function() {
    var app = document.getElementById('app');
    if (!document.getElementById('method-badge')) {
      app.innerHTML = S._initialAppHtml;
      setupEventListeners();
      setupCollapsibleSections();
    }
  };

  function init() {
    setupEventListeners();
    setupCollapsibleSections();
    S.vscode.postMessage({ type: 'ready' });
  }

  function setupEventListeners() {
    const sendBtn = document.getElementById('send-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const queryParamsTable = document.getElementById('req-query-params-table').querySelector('tbody');
    const headersTable = document.getElementById('req-headers-table').querySelector('tbody');
    const cookiesTable = document.getElementById('req-cookies-table').querySelector('tbody');
    const prettyPrint = document.getElementById('pretty-print');
    const wordWrap = document.getElementById('word-wrap');
    sendBtn.addEventListener('click', S.sendRequest);
    cancelBtn.addEventListener('click', S.cancelRequest);

    document.getElementById('add-query-param').addEventListener('click', () => S.addCustomParamRow(queryParamsTable));
    document.getElementById('add-header').addEventListener('click', () => S.addCustomParamRow(headersTable));
    document.getElementById('add-cookie').addEventListener('click', () => S.addCustomParamRow(cookiesTable));

    document.querySelectorAll('.request-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => S.switchRequestTab(btn.dataset.reqTab));
    });

    document.querySelectorAll('.main-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => S.switchMainTab(btn.dataset.mainTab));
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => S.switchTab(btn.dataset.tab));
    });

    prettyPrint.addEventListener('change', () => S.updateResponseBody());
    wordWrap.addEventListener('change', () => {
      document.getElementById('response-body').classList.toggle('word-wrap', wordWrap.checked);
    });

    document.getElementById('copy-response-btn').addEventListener('click', S.copyResponse);
    document.getElementById('copy-curl-btn').addEventListener('click', S.copyCurl);
    document.getElementById('save-response-btn').addEventListener('click', S.saveResponse);

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        S.sendRequest();
      }
    });
  }

  S.switchMainTab = function(tabName) {
    document.querySelectorAll('.main-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mainTab === tabName);
    });
    document.querySelectorAll('.main-tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `${tabName}-tab`);
    });

    if (tabName === 'components' && S.currentComponents) {
      S.renderComponents();
    }

    if (tabName === 'comp-parameters' && S.currentComponents) {
      S.renderEditableParameters();
    }

    if (tabName === 'servers' && S.currentServers) {
      S.renderServers();
    }
  };

  S.switchTab = function(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(`response-${tab}-tab`).classList.add('active');

    // Only show toolbar for Body tab
    var isBody = tab === 'body';
    document.getElementById('response-toolbar').style.display = isBody ? 'flex' : 'none';
  };

  function setupCollapsibleSections() {
    document.querySelectorAll('.section-header.collapsible').forEach(header => {
      header.addEventListener('click', () => {
        header.classList.toggle('collapsed');
        header.nextElementSibling.classList.toggle('hidden');
      });
    });
  }

  window.addEventListener('message', event => {
    const message = event.data;
    switch (message.type) {
      case 'showEndpoint':
        S.restoreEndpointView();
        S.showEndpoint(message.payload.endpoint, message.payload.servers, message.payload.components);
        break;
      case 'responseReceived':
        S.showResponse(message.payload);
        break;
      case 'error':
        S.showError(message.payload.message, message.payload.details);
        break;
      case 'loading':
        S.setLoading(message.payload.loading);
        break;
      case 'updateEnvironments':
        S.updateEnvironments(message.payload.environments, message.payload.activeId);
        break;
      case 'overviewSaved':
        S.showSaveStatus(message.payload.success, message.payload.message);
        break;
      case 'updateServers':
        S.currentServers = message.payload.servers || [];
        S.updateServersTabVisibility();
        S.renderServers();
        S.renderServerList();
        break;
      case 'showAddServer':
        S.handleShowAddServer(message.payload.filePath, message.payload.servers);
        break;
      case 'showApiFile':
        S.handleShowApiFile(message.payload);
        break;
      case 'showSchemaFile':
        S.handleShowSchemaFile(message.payload);
        break;
      case 'updateSchemas':
        S.currentComponents = message.payload.components;
        S.renderEditableSchemas();
        if (typeof S.renderEditableParameters === 'function') {
          S.renderEditableParameters();
        }
        break;
      case 'showAddSchemaDialog':
        if (S.showSchemaDialog) {
          S.showSchemaDialog();
        }
        break;
    }
  });

  init();
})();
