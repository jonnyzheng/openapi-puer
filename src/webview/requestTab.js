// Request tab logic for SuperAPI webview
(function() {
  const S = window.SuperAPI;

  S.setupRequestBuilder = function(endpoint, servers) {
    const escapeHtml = S.escapeHtml;
    const baseUrlInput = document.getElementById('base-url');
    const pathParamsContainer = document.getElementById('path-params-container');
    const queryParamsTable = document.getElementById('query-params-table').querySelector('tbody');
    const headersTable = document.getElementById('headers-table').querySelector('tbody');
    const contentTypeSelect = document.getElementById('content-type-select');
    const bodyEditor = document.getElementById('body-editor');

    baseUrlInput.value = servers.length > 0 ? servers[0].url : '';

    pathParamsContainer.innerHTML = '';
    const pathParams = endpoint.parameters?.filter(p => p.in === 'path') || [];
    if (pathParams.length) {
      pathParamsContainer.innerHTML = '<h4>Path Parameters</h4>';
      pathParams.forEach(p => {
        const div = document.createElement('div');
        div.className = 'path-param-row';
        div.innerHTML = `
          <label>${escapeHtml(p.name)} ${p.required ? '<span class="required-indicator">*</span>' : ''}</label>
          <input type="text" data-param="${escapeHtml(p.name)}" placeholder="${escapeHtml(p.description || p.name)}">
        `;
        pathParamsContainer.appendChild(div);
      });
    }

    queryParamsTable.innerHTML = '';
    const queryParams = endpoint.parameters?.filter(p => p.in === 'query') || [];
    queryParams.forEach(p => {
      S.addParamRow(queryParamsTable, p.name, '', true);
    });

    headersTable.innerHTML = '';
    const headerParams = endpoint.parameters?.filter(p => p.in === 'header') || [];
    headerParams.forEach(p => {
      S.addParamRow(headersTable, p.name, '', true);
    });

    const hasBody = ['post', 'put', 'patch'].includes(endpoint.method);
    document.getElementById('body-container').style.display = hasBody ? 'block' : 'none';
    bodyEditor.value = '';

    if (endpoint.requestBody?.content) {
      const contentTypes = Object.keys(endpoint.requestBody.content);
      contentTypeSelect.innerHTML = contentTypes.map(ct =>
        `<option value="${escapeHtml(ct)}">${escapeHtml(ct)}</option>`
      ).join('');
    }
  };

  S.addParamRow = function(table, key, value, enabled) {
    if (key === undefined) key = '';
    if (value === undefined) value = '';
    if (enabled === undefined) enabled = true;
    const escapeHtml = S.escapeHtml;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><input type="checkbox" ${enabled ? 'checked' : ''}></td>
      <td><input type="text" value="${escapeHtml(key)}" placeholder="Key"></td>
      <td><input type="text" value="${escapeHtml(value)}" placeholder="Value"></td>
      <td><button class="delete-btn">×</button></td>
    `;
    row.querySelector('.delete-btn').addEventListener('click', () => row.remove());
    table.appendChild(row);
  };

  S.generateBodyFromSchema = function() {
    if (!S.currentEndpoint?.requestBody?.content) return;

    const contentTypeSelect = document.getElementById('content-type-select');
    const bodyEditor = document.getElementById('body-editor');
    const contentType = contentTypeSelect.value;
    const media = S.currentEndpoint.requestBody.content[contentType];
    if (media?.schema) {
      const sample = S.generateSampleFromSchema(media.schema);
      bodyEditor.value = JSON.stringify(sample, null, 2);
    }
  };

  S.sendRequest = function() {
    if (S.isLoading || !S.currentEndpoint) return;

    const config = S.buildRequestConfig();
    if (!config) return;

    S.setLoading(true);
    S.vscode.postMessage({ type: 'sendRequest', payload: config });
  };

  S.buildRequestConfig = function() {
    const pathParamsContainer = document.getElementById('path-params-container');
    const queryParamsTable = document.getElementById('query-params-table').querySelector('tbody');
    const headersTable = document.getElementById('headers-table').querySelector('tbody');
    const baseUrlInput = document.getElementById('base-url');
    const bodyEditor = document.getElementById('body-editor');
    const contentTypeSelect = document.getElementById('content-type-select');

    const pathParams = {};
    pathParamsContainer.querySelectorAll('input[data-param]').forEach(input => {
      pathParams[input.dataset.param] = input.value;
    });

    const requiredPathParams = S.currentEndpoint.parameters?.filter(p => p.in === 'path' && p.required) || [];
    for (const p of requiredPathParams) {
      if (!pathParams[p.name]) {
        alert(`Path parameter "${p.name}" is required`);
        return null;
      }
    }

    const queryParams = [];
    queryParamsTable.querySelectorAll('tr').forEach(row => {
      const enabled = row.querySelector('input[type="checkbox"]').checked;
      const key = row.querySelectorAll('input[type="text"]')[0].value;
      const value = row.querySelectorAll('input[type="text"]')[1].value;
      if (key) {
        queryParams.push({ key, value, enabled });
      }
    });

    const headers = [];
    headersTable.querySelectorAll('tr').forEach(row => {
      const enabled = row.querySelector('input[type="checkbox"]').checked;
      const key = row.querySelectorAll('input[type="text"]')[0].value;
      const value = row.querySelectorAll('input[type="text"]')[1].value;
      if (key) {
        headers.push({ key, value, enabled });
      }
    });

    return {
      baseUrl: baseUrlInput.value,
      path: S.currentEndpoint.path,
      method: S.currentEndpoint.method,
      pathParams,
      queryParams,
      headers,
      body: bodyEditor.value || undefined,
      contentType: contentTypeSelect.value
    };
  };

  S.cancelRequest = function() {
    S.vscode.postMessage({ type: 'cancelRequest' });
    S.setLoading(false);
  };

  S.setLoading = function(loading) {
    const sendBtn = document.getElementById('send-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const loadingIndicator = document.getElementById('loading-indicator');
    const elapsedTime = document.getElementById('elapsed-time');

    S.isLoading = loading;
    sendBtn.disabled = loading;
    sendBtn.style.display = loading ? 'none' : 'inline-block';
    cancelBtn.style.display = loading ? 'inline-block' : 'none';
    loadingIndicator.style.display = loading ? 'inline' : 'none';

    if (loading) {
      S.startTime = Date.now();
      S.elapsedInterval = setInterval(() => {
        elapsedTime.textContent = `${((Date.now() - S.startTime) / 1000).toFixed(1)}s`;
      }, 100);
    } else {
      clearInterval(S.elapsedInterval);
      elapsedTime.textContent = '';
    }
  };

  S.showResponse = function(response) {
    S.lastResponse = response;
    S.setLoading(false);

    const noResponse = document.getElementById('no-response');
    const statusCode = document.getElementById('status-code');
    const responseTime = document.getElementById('response-time');
    const responseSize = document.getElementById('response-size');
    const responseHeadersTable = document.getElementById('response-headers-table').querySelector('tbody');

    noResponse.classList.add('hidden');
    document.getElementById('response-status').style.display = 'flex';
    document.getElementById('response-tabs').style.display = 'flex';
    document.getElementById('response-toolbar').style.display = 'flex';
    document.getElementById('response-search').style.display = 'flex';

    statusCode.textContent = `${response.status} ${response.statusText}`;
    statusCode.className = S.getStatusClass(response.status);

    responseTime.textContent = `${response.time}ms`;
    responseSize.textContent = S.formatSize(response.size);

    S.updateResponseBody();

    responseHeadersTable.innerHTML = '';
    for (const [key, value] of Object.entries(response.headers)) {
      const row = document.createElement('tr');
      row.innerHTML = `<td><strong>${S.escapeHtml(key)}</strong></td><td>${S.escapeHtml(value)}</td>`;
      responseHeadersTable.appendChild(row);
    }

    S.switchTab('body');
  };

  S.updateResponseBody = function() {
    if (!S.lastResponse) return;

    const prettyPrint = document.getElementById('pretty-print');
    const responseBody = document.getElementById('response-body').querySelector('code');

    let body = S.lastResponse.body;
    if (prettyPrint.checked && S.lastResponse.contentType?.includes('json')) {
      try {
        body = JSON.stringify(JSON.parse(body), null, 2);
      } catch {}
    }

    responseBody.textContent = body;
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.getElementById('response-body-tab').style.display = 'block';
  };

  S.showError = function(message, details) {
    S.setLoading(false);
    const noResponse = document.getElementById('no-response');
    noResponse.classList.remove('hidden');
    noResponse.innerHTML = `<div style="color: var(--vscode-errorForeground);">
      <strong>Error:</strong> ${S.escapeHtml(message)}
      ${details ? `<br><small>${S.escapeHtml(details)}</small>` : ''}
    </div>`;
  };

  S.copyResponse = function() {
    if (S.lastResponse) {
      navigator.clipboard.writeText(S.lastResponse.body);
    }
  };

  S.copyCurl = function() {
    if (!S.currentEndpoint) return;

    const config = S.buildRequestConfig();
    if (!config) return;

    let url = config.baseUrl + config.path;
    for (const [key, value] of Object.entries(config.pathParams)) {
      url = url.replace(`{${key}}`, encodeURIComponent(value));
    }

    const enabledQuery = config.queryParams.filter(p => p.enabled);
    if (enabledQuery.length) {
      url += '?' + enabledQuery.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
    }

    let curl = `curl -X ${config.method.toUpperCase()} '${url}'`;

    config.headers.filter(h => h.enabled).forEach(h => {
      curl += ` \\\n  -H '${h.key}: ${h.value}'`;
    });

    if (config.body) {
      curl += ` \\\n  -H 'Content-Type: ${config.contentType}'`;
      curl += ` \\\n  -d '${config.body.replace(/'/g, "\\'")}'`;
    }

    navigator.clipboard.writeText(curl);
  };

  S.saveResponse = function() {
    if (S.lastResponse) {
      S.vscode.postMessage({ type: 'saveResponse', payload: S.lastResponse });
    }
  };

  S.searchInResponse = function() {
    const searchInput = document.getElementById('search-input');
    const responseBody = document.getElementById('response-body').querySelector('code');
    const query = searchInput.value.toLowerCase();
    S.searchMatches = [];
    S.currentMatchIndex = -1;

    if (!query || !S.lastResponse) {
      document.getElementById('search-results').textContent = '';
      S.updateResponseBody();
      return;
    }

    const body = responseBody.textContent;
    let index = 0;
    while ((index = body.toLowerCase().indexOf(query, index)) !== -1) {
      S.searchMatches.push(index);
      index += query.length;
    }

    document.getElementById('search-results').textContent =
      S.searchMatches.length ? `${S.searchMatches.length} matches` : 'No matches';

    if (S.searchMatches.length) {
      S.currentMatchIndex = 0;
      S.highlightMatches(query);
    }
  };

  S.highlightMatches = function(query) {
    if (!S.lastResponse) return;

    const responseBody = document.getElementById('response-body').querySelector('code');
    let body = responseBody.textContent;
    let html = '';
    let lastIndex = 0;

    S.searchMatches.forEach((matchIndex, i) => {
      html += S.escapeHtml(body.substring(lastIndex, matchIndex));
      const matchText = body.substring(matchIndex, matchIndex + query.length);
      const className = i === S.currentMatchIndex ? 'highlight current' : 'highlight';
      html += `<span class="${className}">${S.escapeHtml(matchText)}</span>`;
      lastIndex = matchIndex + query.length;
    });

    html += S.escapeHtml(body.substring(lastIndex));
    responseBody.innerHTML = html;
  };

  S.navigateSearch = function(direction) {
    if (!S.searchMatches.length) return;

    const searchInput = document.getElementById('search-input');
    S.currentMatchIndex = (S.currentMatchIndex + direction + S.searchMatches.length) % S.searchMatches.length;
    S.highlightMatches(searchInput.value.toLowerCase());
  };

  S.updateEnvironments = function(environments, activeId) {
    const environmentSelect = document.getElementById('environment-select');
    environmentSelect.innerHTML = '<option value="">No Environment</option>';
    environments.forEach(env => {
      const option = document.createElement('option');
      option.value = env.id;
      option.textContent = env.name;
      if (env.id === activeId) option.selected = true;
      environmentSelect.appendChild(option);
    });
  };
})();
