// Request tab logic for OpenAPI Puer webview
(function() {
  const S = window.OpenAPIPuer;

  S._activeRequestTab = 'params';

  S.setupRequestBuilder = function(endpoint, servers) {
    const escapeHtml = S.escapeHtml;
    const baseUrlInput = document.getElementById('base-url');

    baseUrlInput.value = servers.length > 0 ? servers[0].url : '';

    const reqBodyTab = document.getElementById('req-body-tab');
    if (reqBodyTab) {
      reqBodyTab.innerHTML = '';
      S.renderRequestBodyTab(reqBodyTab, endpoint);
    }

    // Populate path params
    const pathParamsContainer = document.getElementById('req-path-params');
    pathParamsContainer.innerHTML = '';
    const pathParams = endpoint.parameters?.filter(p => p.in === 'path') || [];
    if (pathParams.length) {
      pathParams.forEach(p => {
        const div = document.createElement('div');
        div.className = 'path-param-row';
        div.innerHTML = `
          <label>${escapeHtml(p.name)} ${p.required ? '<span class="required-indicator">*</span>' : ''}</label>
          <input type="text" data-param="${escapeHtml(p.name)}" placeholder="${escapeHtml(p.schema?.type || 'string')} ${p.description ? '- ' + escapeHtml(p.description) : ''}">
        `;
        pathParamsContainer.appendChild(div);
      });
    }

    // Populate query params
    const queryParamsTable = document.getElementById('req-query-params-table').querySelector('tbody');
    queryParamsTable.innerHTML = '';
    const queryParams = endpoint.parameters?.filter(p => p.in === 'query') || [];
    queryParams.forEach(p => {
      S.addRequestParamRow(queryParamsTable, p.name, '', true, p);
    });

    // Populate headers
    const headersTable = document.getElementById('req-headers-table').querySelector('tbody');
    headersTable.innerHTML = '';
    const headerParams = endpoint.parameters?.filter(p => p.in === 'header') || [];
    if (headerParams.length) {
      headerParams.forEach(p => {
        S.addRequestParamRow(headersTable, p.name, '', true, p);
      });
    } else {
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = '<td colspan="5" class="no-params-message">No headers defined. Click + to add.</td>';
      headersTable.appendChild(emptyRow);
    }

    // Populate cookies
    const cookiesTable = document.getElementById('req-cookies-table').querySelector('tbody');
    cookiesTable.innerHTML = '';
    const cookieParams = endpoint.parameters?.filter(p => p.in === 'cookie') || [];
    if (cookieParams.length) {
      cookieParams.forEach(p => {
        S.addRequestParamRow(cookiesTable, p.name, '', true, p);
      });
    } else {
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = '<td colspan="5" class="no-params-message">No cookies defined. Click + to add.</td>';
      cookiesTable.appendChild(emptyRow);
    }

    const hasBody = ['post', 'put', 'patch'].includes(endpoint.method);
    const bodyTabBtn = document.querySelector('.request-tab-btn[data-req-tab="body"]');
    if (bodyTabBtn) {
      bodyTabBtn.style.display = hasBody ? '' : 'none';
    }
    S._updateRequestTabBadges(endpoint);

    // Switch to params tab by default
    S.switchRequestTab('params');
  };

  S._updateRequestTabBadges = function(endpoint) {
    var params = endpoint.parameters || [];
    var queryCount = params.filter(p => p.in === 'query').length;
    var headerCount = params.filter(p => p.in === 'header').length;
    var cookieCount = params.filter(p => p.in === 'cookie').length;
    var paramCount = queryCount;

    document.querySelectorAll('.request-tab-btn').forEach(function(btn) {
      var tab = btn.dataset.reqTab;
      var label = '';
      if (tab === 'params') label = 'Params' + (paramCount > 0 ? ' (' + paramCount + ')' : '');
      else if (tab === 'body') label = 'Body';
      else if (tab === 'headers') label = 'Headers' + (headerCount > 0 ? ' (' + headerCount + ')' : '');
      else if (tab === 'cookies') label = 'Cookies' + (cookieCount > 0 ? ' (' + cookieCount + ')' : '');
      btn.textContent = label;
    });
  };

  S.switchRequestTab = function(tabName) {
    document.querySelectorAll('.request-tab-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.reqTab === tabName);
    });
    document.querySelectorAll('.request-tab-content').forEach(function(content) {
      content.classList.toggle('active', content.id === 'req-' + tabName + '-tab');
    });
    S._activeRequestTab = tabName;
  };

  S.addRequestParamRow = function(table, key, value, enabled, paramDef) {
    if (key === undefined) key = '';
    if (value === undefined) value = '';
    if (enabled === undefined) enabled = true;
    const escapeHtml = S.escapeHtml;

    // Remove "no params" message row if exists
    var emptyRow = table.querySelector('.no-params-message');
    if (emptyRow) {
      emptyRow.closest('tr').remove();
    }

    const row = document.createElement('tr');
    const typeHint = paramDef?.schema?.type || '';
    const desc = paramDef?.description || '';
    const isRequired = paramDef?.required || false;
    const placeholder = typeHint + (desc ? ' - ' + desc : '');

    row.innerHTML = `
      <td><input type="checkbox" ${enabled ? 'checked' : ''}></td>
      <td class="req-param-key">${escapeHtml(key)}${isRequired ? ' <span class="required-indicator">*</span>' : ''}</td>
      <td><input type="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder || 'Value')}"></td>
      <td class="req-param-type">${escapeHtml(typeHint)}</td>
      <td><button class="delete-btn">×</button></td>
    `;
    row.querySelector('.delete-btn').addEventListener('click', () => row.remove());
    table.appendChild(row);
  };

  S.addCustomParamRow = function(table) {
    // Remove "no params" message row if exists
    var emptyRow = table.querySelector('.no-params-message');
    if (emptyRow) {
      emptyRow.closest('tr').remove();
    }

    const row = document.createElement('tr');
    row.innerHTML = `
      <td><input type="checkbox" checked></td>
      <td><input type="text" value="" placeholder="Key" class="req-custom-key"></td>
      <td><input type="text" value="" placeholder="Value"></td>
      <td></td>
      <td><button class="delete-btn">×</button></td>
    `;
    row.querySelector('.delete-btn').addEventListener('click', () => row.remove());
    table.appendChild(row);
  };

  S.generateBodyFromSchema = function() {
    if (!S.currentEndpoint?.requestBody?.content) return;

    var contentType = REQ_BODY_TYPE_MAP[S._currentRequestBodyType];
    if (!contentType) return;
    var media = S.currentEndpoint.requestBody.content[contentType];
    if (media?.schema) {
      var sample = S.generateSampleFromSchema(media.schema);
      var jsonEditor = document.getElementById('request-body-json-editor');
      if (jsonEditor) {
        jsonEditor.value = JSON.stringify(sample, null, 2);
      }
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
    const baseUrlInput = document.getElementById('base-url');

    // Path params
    const pathParams = {};
    document.getElementById('req-path-params').querySelectorAll('input[data-param]').forEach(input => {
      pathParams[input.dataset.param] = input.value;
    });

    const requiredPathParams = S.currentEndpoint.parameters?.filter(p => p.in === 'path' && p.required) || [];
    for (const p of requiredPathParams) {
      if (!pathParams[p.name]) {
        alert(`Path parameter "${p.name}" is required`);
        S.switchRequestTab('params');
        return null;
      }
    }

    // Query params
    const queryParams = [];
    document.getElementById('req-query-params-table').querySelectorAll('tbody tr').forEach(row => {
      const checkbox = row.querySelector('input[type="checkbox"]');
      if (!checkbox) return;
      const enabled = checkbox.checked;
      const keyCell = row.querySelector('.req-param-key');
      const customKeyInput = row.querySelector('.req-custom-key');
      const key = customKeyInput ? customKeyInput.value : (keyCell ? keyCell.textContent.replace(/\s*\*\s*$/, '').trim() : '');
      const valueInput = row.querySelectorAll('input[type="text"]')[customKeyInput ? 1 : 0];
      const value = valueInput ? valueInput.value : '';
      if (key) {
        queryParams.push({ key, value, enabled });
      }
    });

    // Headers
    const headers = [];
    document.getElementById('req-headers-table').querySelectorAll('tbody tr').forEach(row => {
      const checkbox = row.querySelector('input[type="checkbox"]');
      if (!checkbox) return;
      const enabled = checkbox.checked;
      const keyCell = row.querySelector('.req-param-key');
      const customKeyInput = row.querySelector('.req-custom-key');
      const key = customKeyInput ? customKeyInput.value : (keyCell ? keyCell.textContent.replace(/\s*\*\s*$/, '').trim() : '');
      const valueInput = row.querySelectorAll('input[type="text"]')[customKeyInput ? 1 : 0];
      const value = valueInput ? valueInput.value : '';
      if (key) {
        headers.push({ key, value, enabled });
      }
    });

    // Cookies - build Cookie header from cookie params
    const cookieParts = [];
    document.getElementById('req-cookies-table').querySelectorAll('tbody tr').forEach(row => {
      const checkbox = row.querySelector('input[type="checkbox"]');
      if (!checkbox) return;
      const enabled = checkbox.checked;
      const keyCell = row.querySelector('.req-param-key');
      const customKeyInput = row.querySelector('.req-custom-key');
      const key = customKeyInput ? customKeyInput.value : (keyCell ? keyCell.textContent.replace(/\s*\*\s*$/, '').trim() : '');
      const valueInput = row.querySelectorAll('input[type="text"]')[customKeyInput ? 1 : 0];
      const value = valueInput ? valueInput.value : '';
      if (key && enabled) {
        cookieParts.push(`${key}=${value}`);
      }
    });
    if (cookieParts.length) {
      headers.push({ key: 'Cookie', value: cookieParts.join('; '), enabled: true });
    }

    // Body - read from the active request body editor
    var body = undefined;
    var contentType = 'application/json';
    var bodyType = S._currentRequestBodyType || 'none';

    if (bodyType !== 'none') {
      contentType = REQ_BODY_TYPE_MAP[bodyType] || 'application/json';

      if (bodyType === 'json') {
        var jsonEditor = document.getElementById('request-body-json-editor');
        body = jsonEditor ? jsonEditor.value || undefined : undefined;
      } else if (bodyType === 'raw') {
        var rawEditor = document.getElementById('request-body-raw-editor');
        body = rawEditor ? rawEditor.value || undefined : undefined;
      } else if (bodyType === 'form-data') {
        var formTable = document.getElementById('request-form-data-table');
        if (formTable) {
          var formData = [];
          formTable.querySelectorAll('tbody tr').forEach(function(tr) {
            var nameInput = tr.querySelector('.kv-name-input');
            var valueInput = tr.querySelector('.kv-value-input');
            if (nameInput && nameInput.value.trim()) {
              formData.push(nameInput.value.trim() + '=' + (valueInput ? valueInput.value : ''));
            }
          });
          body = formData.join('&');
        }
      } else if (bodyType === 'x-www-form-urlencoded') {
        var urlTable = document.getElementById('request-url-encoded-table');
        if (urlTable) {
          var urlData = [];
          urlTable.querySelectorAll('tbody tr').forEach(function(tr) {
            var nameInput = tr.querySelector('.kv-name-input');
            var valueInput = tr.querySelector('.kv-value-input');
            if (nameInput && nameInput.value.trim()) {
              urlData.push(encodeURIComponent(nameInput.value.trim()) + '=' + encodeURIComponent(valueInput ? valueInput.value : ''));
            }
          });
          body = urlData.join('&');
        }
      }
    }

    return {
      baseUrl: baseUrlInput.value,
      path: S.currentEndpoint.path,
      method: S.currentEndpoint.method,
      pathParams,
      queryParams,
      headers,
      body: body,
      contentType: contentType
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

    S.isLoading = loading;
    sendBtn.disabled = loading;
    sendBtn.style.display = loading ? 'none' : 'inline-block';
    cancelBtn.style.display = loading ? 'inline-block' : 'none';
    loadingIndicator.style.display = loading ? 'inline' : 'none';
  };

  S._parseCookies = function(headers) {
    const cookies = [];
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() !== 'set-cookie') continue;
      // Value may contain multiple cookies joined by ", " (axios joins array headers)
      // Split carefully: a comma followed by a space and a token= pattern starts a new cookie
      const parts = value.split(/,\s*(?=[A-Za-z0-9_\-.]+=)/);
      parts.forEach(function(cookieStr) {
        const segments = cookieStr.split(';').map(s => s.trim());
        if (!segments.length) return;
        const firstEq = segments[0].indexOf('=');
        if (firstEq < 0) return;
        const cookie = {
          name: segments[0].substring(0, firstEq),
          value: segments[0].substring(firstEq + 1),
          domain: '',
          path: '',
          expires: '',
          httpOnly: false,
          secure: false,
          sameSite: ''
        };
        for (let i = 1; i < segments.length; i++) {
          const seg = segments[i];
          const eqIdx = seg.indexOf('=');
          const attrName = (eqIdx >= 0 ? seg.substring(0, eqIdx) : seg).toLowerCase().trim();
          const attrVal = eqIdx >= 0 ? seg.substring(eqIdx + 1).trim() : '';
          if (attrName === 'domain') cookie.domain = attrVal;
          else if (attrName === 'path') cookie.path = attrVal;
          else if (attrName === 'expires') cookie.expires = attrVal;
          else if (attrName === 'max-age') cookie.expires = cookie.expires || ('max-age=' + attrVal);
          else if (attrName === 'httponly') cookie.httpOnly = true;
          else if (attrName === 'secure') cookie.secure = true;
          else if (attrName === 'samesite') cookie.sameSite = attrVal;
        }
        cookies.push(cookie);
      });
    }
    return cookies;
  };

  S.showResponse = function(response) {
    S.lastResponse = response;
    S.setLoading(false);

    const escapeHtml = S.escapeHtml;
    const noResponse = document.getElementById('no-response');
    const statusCode = document.getElementById('status-code');
    const responseTime = document.getElementById('response-time');
    const responseSize = document.getElementById('response-size');
    const responseHeadersTable = document.getElementById('response-headers-table').querySelector('tbody');

    noResponse.classList.add('hidden');
    document.getElementById('response-status').style.display = 'flex';
    document.getElementById('response-tabs').style.display = 'flex';

    statusCode.textContent = `${response.status} ${response.statusText}`;
    statusCode.className = S.getStatusClass(response.status);

    responseTime.textContent = `${response.time}ms`;
    responseSize.textContent = S.formatSize(response.size);

    S.updateResponseBody();

    // Populate headers table
    responseHeadersTable.innerHTML = '';
    for (const [key, value] of Object.entries(response.headers)) {
      const row = document.createElement('tr');
      row.innerHTML = `<td><strong>${escapeHtml(key)}</strong></td><td>${escapeHtml(value)}</td>`;
      responseHeadersTable.appendChild(row);
    }

    // Populate cookies table
    const cookies = S._parseCookies(response.headers);
    const cookiesTbody = document.getElementById('response-cookies-table').querySelector('tbody');
    const noCookies = document.getElementById('no-cookies');
    cookiesTbody.innerHTML = '';
    if (cookies.length) {
      noCookies.style.display = 'none';
      cookies.forEach(function(c) {
        const row = document.createElement('tr');
        row.innerHTML =
          '<td><strong>' + escapeHtml(c.name) + '</strong></td>' +
          '<td>' + escapeHtml(c.value) + '</td>' +
          '<td>' + escapeHtml(c.domain) + '</td>' +
          '<td>' + escapeHtml(c.path) + '</td>' +
          '<td>' + escapeHtml(c.expires) + '</td>' +
          '<td>' + (c.httpOnly ? '✓' : '') + '</td>' +
          '<td>' + (c.secure ? '✓' : '') + '</td>' +
          '<td>' + escapeHtml(c.sameSite) + '</td>';
        cookiesTbody.appendChild(row);
      });
    } else {
      noCookies.style.display = '';
    }

    // Update cookies tab badge
    const cookiesTabBtn = document.querySelector('.tab-btn[data-tab="cookies"]');
    if (cookiesTabBtn) {
      cookiesTabBtn.textContent = 'Cookies' + (cookies.length > 0 ? ' (' + cookies.length + ')' : '');
    }

    S.switchTab('body');
  };

  S._highlightJson = function(json) {
    // Use Prism.js for JSON syntax highlighting
    if (typeof Prism !== 'undefined' && Prism.languages.json) {
      return Prism.highlight(json, Prism.languages.json, 'json');
    }
    // Fallback to escaping if Prism is not available
    return S.escapeHtml(json);
  };

  S.updateResponseBody = function() {
    if (!S.lastResponse) return;

    const prettyPrint = document.getElementById('pretty-print');
    const responseBody = document.getElementById('response-body').querySelector('code');

    let body = S.lastResponse.body;
    var contentType = S.lastResponse.contentType || '';
    var isJson = contentType.includes('json');
    var isXml = contentType.includes('xml');
    var isHtml = contentType.includes('html');
    var isJavascript = contentType.includes('javascript');
    var isCss = contentType.includes('css');

    if (prettyPrint.checked && isJson) {
      try {
        body = JSON.stringify(JSON.parse(body), null, 2);
      } catch {}
    }

    // Use Prism.js for syntax highlighting based on content type
    if (typeof Prism !== 'undefined') {
      var language = null;
      var grammar = null;

      if (isJson && Prism.languages.json) {
        language = 'json';
        grammar = Prism.languages.json;
      } else if (isXml && Prism.languages.xml) {
        language = 'xml';
        grammar = Prism.languages.xml;
      } else if (isHtml && Prism.languages.html) {
        language = 'html';
        grammar = Prism.languages.html;
      } else if (isJavascript && Prism.languages.javascript) {
        language = 'javascript';
        grammar = Prism.languages.javascript;
      } else if (isCss && Prism.languages.css) {
        language = 'css';
        grammar = Prism.languages.css;
      }

      if (grammar) {
        responseBody.innerHTML = Prism.highlight(body, grammar, language);
        responseBody.className = 'language-' + language;
      } else {
        responseBody.textContent = body;
        responseBody.className = '';
      }
    } else {
      // Fallback when Prism is not available
      if (isJson) {
        responseBody.innerHTML = S._highlightJson(body);
      } else {
        responseBody.textContent = body;
      }
    }

    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById('response-body-tab').classList.add('active');
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

  // ---- Request Body Tab Implementation (mirrors renderBodyTab in detailsTab.js) ----

  var REQ_BODY_TYPE_MAP = {
    'none': null,
    'form-data': 'multipart/form-data',
    'json': 'application/json',
    'raw': 'text/plain',
    'x-www-form-urlencoded': 'application/x-www-form-urlencoded'
  };

  var REQ_CONTENT_TYPE_TO_BODY_TYPE = {};
  Object.keys(REQ_BODY_TYPE_MAP).forEach(function(k) {
    if (REQ_BODY_TYPE_MAP[k]) REQ_CONTENT_TYPE_TO_BODY_TYPE[REQ_BODY_TYPE_MAP[k]] = k;
  });

  S._currentRequestBodyType = 'none';

  function detectRequestBodyType(endpoint) {
    if (!endpoint.requestBody || !endpoint.requestBody.content) return 'none';
    var keys = Object.keys(endpoint.requestBody.content);
    if (keys.length === 0) return 'none';
    var ct = keys[0];
    return REQ_CONTENT_TYPE_TO_BODY_TYPE[ct] || 'json';
  }

  S.renderRequestBodyTab = function(container, endpoint) {
    // Detect current body type from endpoint
    var currentBodyType = detectRequestBodyType(endpoint);
    S._currentRequestBodyType = currentBodyType;

    // Type selector (same as renderBodyTab)
    var selector = document.createElement('div');
    selector.className = 'body-type-selector';
    var types = ['none', 'form-data', 'json', 'raw', 'x-www-form-urlencoded'];
    types.forEach(function(type) {
      var btn = document.createElement('button');
      btn.className = 'body-type-btn' + (type === currentBodyType ? ' active' : '');
      btn.textContent = type;
      btn.addEventListener('click', function() {
        S._currentRequestBodyType = type;
        selector.querySelectorAll('.body-type-btn').forEach(function(b) {
          b.classList.toggle('active', b.textContent === type);
        });
        S._renderRequestBodyContent(editorArea, type, endpoint);
      });
      selector.appendChild(btn);
    });
    container.appendChild(selector);

    // Editor area
    var editorArea = document.createElement('div');
    editorArea.className = 'body-editor-content';
    container.appendChild(editorArea);

    S._renderRequestBodyContent(editorArea, currentBodyType, endpoint);
  };

  S._renderRequestBodyContent = function(container, type, endpoint) {
    container.innerHTML = '';

    if (type === 'none') {
      container.innerHTML = '<div class="no-content">This request does not have a body</div>';
      return;
    }

    var contentType = REQ_BODY_TYPE_MAP[type];
    var existingMedia = null;

    // Try to get the media for the selected content type
    if (endpoint.requestBody && endpoint.requestBody.content) {
      // First, try exact match
      existingMedia = endpoint.requestBody.content[contentType];

      // If not found, try to find a matching content type
      if (!existingMedia) {
        var keys = Object.keys(endpoint.requestBody.content);
        for (var i = 0; i < keys.length; i++) {
          if (keys[i].indexOf(contentType) === 0 || contentType.indexOf(keys[i]) === 0) {
            existingMedia = endpoint.requestBody.content[keys[i]];
            break;
          }
        }
      }

      // If still not found and this is the detected body type, use the first available content
      if (!existingMedia) {
        var detectedType = detectRequestBodyType(endpoint);
        if (type === detectedType) {
          var keys = Object.keys(endpoint.requestBody.content);
          if (keys.length > 0) {
            existingMedia = endpoint.requestBody.content[keys[0]];
          }
        }
      }
    }

    if (type === 'json') {
      S._renderRequestJsonBodyEditor(container, existingMedia, endpoint);
    } else if (type === 'raw') {
      S._renderRequestRawBodyEditor(container, existingMedia, endpoint);
    } else if (type === 'form-data') {
      S._renderRequestKvBodyEditor(container, existingMedia, true, endpoint);
    } else if (type === 'x-www-form-urlencoded') {
      S._renderRequestKvBodyEditor(container, existingMedia, false, endpoint);
    }
  };

  // JSON body editor for request tab
  S._renderRequestJsonBodyEditor = function(container, existingMedia, endpoint) {
    var schema = existingMedia && existingMedia.schema ? existingMedia.schema : {};
    var escapeHtml = S.escapeHtml;
    var renderSchema = S.renderSchema;


    // JSON editor with Prism.js highlighting
    var editorWrapper = document.createElement('div');
    editorWrapper.className = 'json-editor-wrapper';

    var textarea = document.createElement('textarea');
    textarea.className = 'body-editor-area';
    textarea.id = 'request-body-json-editor';
    // Generate empty template from schema if available
    if (schema && Object.keys(schema).length > 0) {
      var template = S.generateEmptyTemplateFromSchema(schema);
      textarea.value = JSON.stringify(template, null, 2);
    } else {
      textarea.value = '';
    }
    textarea.placeholder = '{\n  "key": "value"\n}';

    // Highlight on initial render and on input
    function updateHighlight() {
      if (typeof Prism !== 'undefined' && Prism.languages.json) {
        try {
          var json = textarea.value;
          // Create a highlighted version
          var highlighted = Prism.highlight(json, Prism.languages.json, 'json');
          var codeElement = document.getElementById('request-body-json-highlight');
          if (codeElement) {
            codeElement.innerHTML = highlighted;
            codeElement.className = 'language-json';
          }
        } catch (e) {
          // Ignore invalid JSON for highlighting
        }
      }
    }

    textarea.addEventListener('input', updateHighlight);

    // Create highlighted code display
    var highlightPre = document.createElement('pre');
    highlightPre.className = 'json-highlight-pre';
    var highlightCode = document.createElement('code');
    highlightCode.id = 'request-body-json-highlight';
    highlightCode.className = 'language-json';
    highlightPre.appendChild(highlightCode);

    editorWrapper.appendChild(highlightPre);
    editorWrapper.appendChild(textarea);

    // Sync scroll positions
    textarea.addEventListener('scroll', function() {
      highlightPre.scrollTop = textarea.scrollTop;
      highlightPre.scrollLeft = textarea.scrollLeft;
    });

    container.appendChild(editorWrapper);

    // Initial highlight
    updateHighlight();
  };

  // Raw text body editor for request tab
  S._renderRequestRawBodyEditor = function(container, existingMedia, endpoint) {

    var textarea = document.createElement('textarea');
    textarea.className = 'body-editor-area';
    textarea.id = 'request-body-raw-editor';
    textarea.placeholder = 'Enter raw body content...';
    if (existingMedia && existingMedia.example) {
      textarea.value = typeof existingMedia.example === 'string' ? existingMedia.example : JSON.stringify(existingMedia.example);
    }
    container.appendChild(textarea);
  };

  // Key-value body editor (form-data / x-www-form-urlencoded) for request tab
  S._renderRequestKvBodyEditor = function(container, existingMedia, isFormData, endpoint) {
    var contentType = isFormData ? 'multipart/form-data' : 'application/x-www-form-urlencoded';

    // Extract existing fields from schema properties
    var rows = [];
    if (existingMedia && existingMedia.schema && existingMedia.schema.properties) {
      var props = existingMedia.schema.properties;
      var requiredList = existingMedia.schema.required || [];
      Object.keys(props).forEach(function(name) {
        var p = props[name];
        rows.push({
          name: name,
          type: (p.format === 'binary') ? 'file' : (p.type || 'string'),
          description: p.description || '',
          required: requiredList.indexOf(name) !== -1,
          value: ''
        });
      });
    }

    var table = document.createElement('table');
    table.className = 'body-kv-table';
    table.id = isFormData ? 'request-form-data-table' : 'request-url-encoded-table';

    var thead = document.createElement('thead');
    var headerHtml = '<tr><th>Name</th>';
    if (isFormData) headerHtml += '<th>Type</th>';
    headerHtml += '<th>Value</th><th>Description</th><th></th></tr>';
    thead.innerHTML = headerHtml;
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    table.appendChild(tbody);

    function addKvRow(data) {
      var tr = document.createElement('tr');

      // Name
      var tdName = document.createElement('td');
      var nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = data.name || '';
      nameInput.placeholder = 'field name';
      nameInput.className = 'kv-name-input';
      tdName.appendChild(nameInput);
      tr.appendChild(tdName);

      // Type (form-data only)
      if (isFormData) {
        var tdType = document.createElement('td');
        var typeSelect = document.createElement('select');
        typeSelect.className = 'kv-type-select';
        ['string', 'integer', 'number', 'boolean', 'file'].forEach(function(t) {
          var opt = document.createElement('option');
          opt.value = t;
          opt.textContent = t;
          if (t === (data.type || 'string')) opt.selected = true;
          typeSelect.appendChild(opt);
        });
        tdType.appendChild(typeSelect);
        tr.appendChild(tdType);
      }

      // Value
      var tdValue = document.createElement('td');
      var valueInput = document.createElement('input');
      valueInput.type = 'text';
      valueInput.value = data.value || '';
      valueInput.placeholder = 'value';
      valueInput.className = 'kv-value-input';
      tdValue.appendChild(valueInput);
      tr.appendChild(tdValue);

      // Description
      var tdDesc = document.createElement('td');
      var descInput = document.createElement('input');
      descInput.type = 'text';
      descInput.value = data.description || '';
      descInput.placeholder = 'description';
      descInput.className = 'kv-desc-input';
      tdDesc.appendChild(descInput);
      tr.appendChild(tdDesc);

      // Delete
      var tdDel = document.createElement('td');
      var delBtn = document.createElement('button');
      delBtn.className = 'delete-field-btn';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', function() {
        tr.remove();
      });
      tdDel.appendChild(delBtn);
      tr.appendChild(tdDel);

      tbody.appendChild(tr);
    }

    rows.forEach(function(r) { addKvRow(r); });

    container.appendChild(table);

    // Add field button
    var addRow = document.createElement('div');
    addRow.className = 'add-param-row';
    var addBtn = document.createElement('button');
    addBtn.className = 'add-param-btn';
    addBtn.textContent = '+ Add Field';
    addBtn.addEventListener('click', function() {
      addKvRow({ name: '', type: 'string', description: '', required: false, value: '' });
    });
    addRow.appendChild(addBtn);
    container.appendChild(addRow);
  };

})();
