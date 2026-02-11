// Servers tab logic for SuperAPI webview
(function() {
  const S = window.SuperAPI;

  S.updateServersTabVisibility = function() {
    const serversTabBtn = document.getElementById('servers-tab-btn');
    if (serversTabBtn) {
      if (S.currentServers && S.currentServers.length > 0) {
        serversTabBtn.style.display = '';
      } else {
        serversTabBtn.style.display = 'none';
        if (serversTabBtn.classList.contains('active')) {
          S.switchMainTab('details');
        }
      }
    }
  };

  S.showServerDialog = function(mode, index, existingServer) {
    const existingDialog = document.querySelector('.server-dialog-overlay');
    if (existingDialog) {
      existingDialog.remove();
    }

    const overlay = document.createElement('div');
    overlay.className = 'server-dialog-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'server-dialog';

    const title = document.createElement('h3');
    title.textContent = mode === 'add' ? 'Add Server' : 'Edit Server';

    const form = document.createElement('div');
    form.className = 'server-form';

    const urlLabel = document.createElement('label');
    urlLabel.textContent = 'URL *';
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.className = 'server-input';
    urlInput.placeholder = 'https://api.example.com';
    urlInput.value = existingServer?.url || '';

    const descLabel = document.createElement('label');
    descLabel.textContent = 'Description';
    const descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.className = 'server-input';
    descInput.placeholder = 'Production server';
    descInput.value = existingServer?.description || '';

    form.appendChild(urlLabel);
    form.appendChild(urlInput);
    form.appendChild(descLabel);
    form.appendChild(descInput);

    const buttons = document.createElement('div');
    buttons.className = 'server-dialog-buttons';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'server-dialog-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());

    const saveBtn = document.createElement('button');
    saveBtn.className = 'server-dialog-save';
    saveBtn.textContent = mode === 'add' ? 'Add' : 'Save';
    saveBtn.addEventListener('click', () => {
      const url = urlInput.value.trim();
      if (!url) {
        urlInput.classList.add('error');
        return;
      }

      const server = { url };
      if (descInput.value.trim()) {
        server.description = descInput.value.trim();
      }

      const filePath = S.currentEndpoint?.filePath || S.currentFilePath;

      if (mode === 'add') {
        S.vscode.postMessage({
          type: 'addServer',
          payload: {
            filePath,
            server
          }
        });
      } else {
        S.vscode.postMessage({
          type: 'updateServer',
          payload: {
            filePath,
            index,
            server
          }
        });
      }

      overlay.remove();
    });

    buttons.appendChild(cancelBtn);
    buttons.appendChild(saveBtn);

    dialog.appendChild(title);
    dialog.appendChild(form);
    dialog.appendChild(buttons);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    urlInput.focus();

    const handleKeydown = (e) => {
      if (e.key === 'Enter') {
        saveBtn.click();
      } else if (e.key === 'Escape') {
        overlay.remove();
      }
    };
    urlInput.addEventListener('keydown', handleKeydown);
    descInput.addEventListener('keydown', handleKeydown);
  };

  S.showDeleteServerDialog = function(index, serverUrl) {
    const escapeHtml = S.escapeHtml;
    const overlay = document.createElement('div');
    overlay.className = 'server-dialog-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'server-dialog';

    const title = document.createElement('h3');
    title.textContent = 'Delete Server';

    const message = document.createElement('p');
    message.className = 'server-delete-message';
    message.innerHTML = `Are you sure you want to delete this server?<br><code>${escapeHtml(serverUrl)}</code>`;

    const buttons = document.createElement('div');
    buttons.className = 'server-dialog-buttons';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'server-dialog-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'server-dialog-delete';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      const filePath = S.currentEndpoint?.filePath || S.currentFilePath;
      S.vscode.postMessage({
        type: 'deleteServer',
        payload: {
          filePath,
          index
        }
      });
      overlay.remove();
    });

    buttons.appendChild(cancelBtn);
    buttons.appendChild(deleteBtn);

    dialog.appendChild(title);
    dialog.appendChild(message);
    dialog.appendChild(buttons);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  };

  S.handleShowAddServer = function(filePath, servers) {
    S.currentFilePath = filePath;
    S.currentServers = servers || [];

    const container = document.getElementById('app');
    if (!container) return;

    container.innerHTML = `
      <div class="server-management-view">
        <div class="server-management-header">
          <h2>Server Management</h2>
          <p class="server-management-subtitle">Manage servers for this API specification</p>
        </div>
        <div class="servers-list-container">
          <div class="section-header-with-action">
            <h3 class="section-header">Servers (${S.currentServers.length})</h3>
            <button class="add-server-btn" id="add-server-main-btn">+ Add Server</button>
          </div>
          <div id="server-list-content"></div>
        </div>
      </div>
    `;

    S.renderServerList();

    const addBtn = document.getElementById('add-server-main-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => S.showServerDialog('add'));
    }
  };

  S.renderServerList = function() {
    const listContent = document.getElementById('server-list-content');
    if (!listContent) return;

    listContent.innerHTML = '';

    if (S.currentServers.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.innerHTML = `
        <p>No servers configured</p>
        <p class="empty-state-hint">Add a server to define the base URL for your API</p>
      `;
      listContent.appendChild(emptyState);
      return;
    }

    S.currentServers.forEach((server, index) => {
      const serverItem = document.createElement('div');
      serverItem.className = 'server-item';

      const serverInfo = document.createElement('div');
      serverInfo.className = 'server-info';

      const serverUrl = document.createElement('div');
      serverUrl.className = 'server-url';
      serverUrl.textContent = server.url;

      serverInfo.appendChild(serverUrl);

      if (server.description) {
        const serverDesc = document.createElement('div');
        serverDesc.className = 'server-description';
        serverDesc.textContent = server.description;
        serverInfo.appendChild(serverDesc);
      }

      const serverActions = document.createElement('div');
      serverActions.className = 'server-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'server-edit-btn';
      editBtn.textContent = 'Edit';
      editBtn.title = 'Edit this server';
      editBtn.addEventListener('click', () => S.showServerDialog('edit', index, server));

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'server-delete-btn';
      deleteBtn.textContent = 'Delete';
      deleteBtn.title = 'Delete this server';
      deleteBtn.addEventListener('click', () => {
        S.showDeleteServerDialog(index, server.url);
      });

      serverActions.appendChild(editBtn);
      serverActions.appendChild(deleteBtn);

      serverItem.appendChild(serverInfo);
      serverItem.appendChild(serverActions);
      listContent.appendChild(serverItem);
    });

    const header = document.querySelector('.servers-list-container .section-header');
    if (header) {
      header.textContent = `Servers (${S.currentServers.length})`;
    }
  };

  S.renderServers = function() {
    const serversContent = document.getElementById('servers-content');
    if (!serversContent) return;

    serversContent.innerHTML = '';

    const serversSection = document.createElement('section');
    serversSection.className = 'section';

    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'section-header-with-action';

    const headerTitle = document.createElement('h3');
    headerTitle.className = 'section-header';
    headerTitle.textContent = `Servers (${S.currentServers.length})`;

    const addServerBtn = document.createElement('button');
    addServerBtn.className = 'add-server-btn';
    addServerBtn.textContent = '+ Add Server';
    addServerBtn.addEventListener('click', () => S.showServerDialog('add'));

    sectionHeader.appendChild(headerTitle);
    sectionHeader.appendChild(addServerBtn);

    const sectionContent = document.createElement('div');
    sectionContent.className = 'section-content';

    if (S.currentServers.length === 0) {
      const emptyMessage = document.createElement('p');
      emptyMessage.className = 'empty-message';
      emptyMessage.textContent = 'No servers defined. Click "Add Server" to add one.';
      sectionContent.appendChild(emptyMessage);
    } else {
      S.currentServers.forEach((server, index) => {
        const serverCard = document.createElement('div');
        serverCard.className = 'server-card';

        const serverHeader = document.createElement('div');
        serverHeader.className = 'server-header';

        const serverIndex = document.createElement('span');
        serverIndex.className = 'server-index';
        serverIndex.textContent = `#${index + 1}`;

        const serverUrl = document.createElement('span');
        serverUrl.className = 'server-url';
        serverUrl.textContent = server.url;

        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'server-buttons';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'server-copy-btn';
        copyBtn.textContent = 'Copy';
        copyBtn.title = 'Copy URL to clipboard';
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(server.url).then(() => {
            copyBtn.textContent = 'Copied!';
            setTimeout(() => {
              copyBtn.textContent = 'Copy';
            }, 1500);
          });
        });

        const useBtn = document.createElement('button');
        useBtn.className = 'server-use-btn';
        useBtn.textContent = 'Use';
        useBtn.title = 'Use this server as base URL';
        useBtn.addEventListener('click', () => {
          const baseUrlInput = document.getElementById('base-url');
          if (baseUrlInput) {
            baseUrlInput.value = server.url;
          }
          S.switchMainTab('request');
        });

        const editBtn = document.createElement('button');
        editBtn.className = 'server-edit-btn';
        editBtn.textContent = 'Edit';
        editBtn.title = 'Edit this server';
        editBtn.addEventListener('click', () => S.showServerDialog('edit', index, server));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'server-delete-btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.title = 'Delete this server';
        deleteBtn.addEventListener('click', () => S.showDeleteServerDialog(index, server.url));

        buttonsContainer.appendChild(copyBtn);
        buttonsContainer.appendChild(useBtn);
        buttonsContainer.appendChild(editBtn);
        buttonsContainer.appendChild(deleteBtn);

        serverHeader.appendChild(serverIndex);
        serverHeader.appendChild(serverUrl);
        serverHeader.appendChild(buttonsContainer);
        serverCard.appendChild(serverHeader);

        if (server.description) {
          const serverDesc = document.createElement('div');
          serverDesc.className = 'server-description';
          serverDesc.textContent = server.description;
          serverCard.appendChild(serverDesc);
        }

        sectionContent.appendChild(serverCard);
      });
    }

    serversSection.appendChild(sectionHeader);
    serversSection.appendChild(sectionContent);
    serversContent.appendChild(serversSection);
  };

  S.handleShowApiFile = function(payload) {
    S.currentFilePath = payload.filePath;
    S.currentServers = payload.servers || [];

    const escapeHtml = S.escapeHtml;
    const container = document.getElementById('app');
    if (!container) return;

    container.innerHTML = `
      <div id="header">
        <div id="endpoint-info">
          <span class="method-badge api-badge">API</span>
          <span id="endpoint-path">${escapeHtml(payload.title || 'Untitled API')}</span>
        </div>
      </div>

      <div id="main-tabs">
        <button class="main-tab-btn active" data-api-tab="info">Info</button>
        <button class="main-tab-btn" data-api-tab="servers">Servers</button>
        <button class="main-tab-btn" data-api-tab="source">Source</button>
      </div>

      <div id="content">
        <div id="api-info-tab" class="main-tab-content active">
          <div id="endpoint-details">
            <section class="section">
              <h3 class="section-header">Overview</h3>
              <div class="section-content">
                <div class="api-info-form">
                  <div class="api-info-field">
                    <label>Title</label>
                    <input type="text" id="api-info-title" class="api-info-input" value="${escapeHtml(payload.title || '')}" placeholder="API title" />
                  </div>
                  <div class="api-info-field">
                    <label>Description</label>
                    <textarea id="api-info-description" class="api-info-textarea" rows="4" placeholder="API description">${escapeHtml(payload.description || '')}</textarea>
                  </div>
                  <div class="api-info-field">
                    <label>Version</label>
                    <input type="text" id="api-info-version" class="api-info-input" value="${escapeHtml(payload.infoVersion || '')}" placeholder="e.g., 1.0.0" />
                  </div>
                  <div class="api-info-field">
                    <label>OpenAPI Version</label>
                    <input type="text" class="api-info-input" value="${escapeHtml(payload.version)}" disabled />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        <div id="api-source-tab" class="main-tab-content">
          <div id="endpoint-details">
            <div class="schema-source-wrapper">
              <pre class="schema-source-pre"><code class="schema-source-code" id="api-source-code"></code></pre>
            </div>
          </div>
        </div>

        <div id="api-servers-tab" class="main-tab-content">
          <div id="endpoint-details">
            <div class="servers-list-container">
              <div class="section-header-with-action">
                <h3 class="section-header">Servers (${S.currentServers.length})</h3>
                <button class="add-server-btn" id="add-server-main-btn">+ Add Server</button>
              </div>
              <div id="server-list-content"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Populate source tab
    var apiSourceCode = document.getElementById('api-source-code');
    if (apiSourceCode && payload.spec) {
      apiSourceCode.innerHTML = S.highlightJson(JSON.stringify(payload.spec, null, 2));
    } else if (apiSourceCode) {
      apiSourceCode.textContent = '// No source available';
    }

    // Setup tab switching
    container.querySelectorAll('#main-tabs .main-tab-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        container.querySelectorAll('#main-tabs .main-tab-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var tabName = btn.dataset.apiTab;
        document.getElementById('api-info-tab').classList.toggle('active', tabName === 'info');
        document.getElementById('api-source-tab').classList.toggle('active', tabName === 'source');
        document.getElementById('api-servers-tab').classList.toggle('active', tabName === 'servers');
      });
    });

    // Setup info field save on blur
    var titleInput = document.getElementById('api-info-title');
    var descInput = document.getElementById('api-info-description');
    var versionInput = document.getElementById('api-info-version');

    function saveApiInfo() {
      S.vscode.postMessage({
        type: 'updateApiInfo',
        payload: {
          filePath: S.currentFilePath,
          updates: {
            title: titleInput.value,
            description: descInput.value,
            version: versionInput.value
          }
        }
      });
    }

    titleInput.addEventListener('change', saveApiInfo);
    descInput.addEventListener('change', saveApiInfo);
    versionInput.addEventListener('change', saveApiInfo);

    // Render server list
    S.renderServerList();

    var addBtn = document.getElementById('add-server-main-btn');
    if (addBtn) {
      addBtn.addEventListener('click', function() { S.showServerDialog('add'); });
    }
  };
})();
