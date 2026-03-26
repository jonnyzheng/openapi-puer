// Request tab logic for OpenAPI Puer webview
(function() {
  const S = window.OpenAPIPuer;

  S._activeRequestTab = 'params';
  S._environmentVariables = [];
  S._activeEnvironmentBaseUrl = '';
  S._requestEndpointServers = [];
  S._requestUrlTemplate = '';
  S._lastEnvironments = [];
  S._lastActiveEnvironmentId = undefined;
  S._variableAutocomplete = {
    isVisible: false,
    element: null,
    activeInput: null,
    tokenStart: -1,
    tokenEnd: -1,
    activeIndex: 0,
    suggestions: []
  };

  const REQUEST_HEADER_KEY_SUGGESTIONS = [
    'Accept',
    'Accept-Charset',
    'Accept-Encoding',
    'Accept-Language',
    'Authorization',
    'Cache-Control',
    'Connection',
    'Content-Length',
    'Content-Type',
    'Cookie',
    'Host',
    'If-Match',
    'If-Modified-Since',
    'If-None-Match',
    'Origin',
    'Pragma',
    'Referer',
    'User-Agent',
    'X-API-Key',
    'X-Requested-With'
  ];
  const REQUEST_HEADER_KEY_AUTOCOMPLETE_ID = 'request-header-key-autocomplete';
  S._requestHeaderKeyAutocomplete = {
    isVisible: false,
    element: null,
    activeInput: null,
    activeIndex: -1,
    suggestions: []
  };

  function createDefaultRequestAuthState() {
    return {
      type: 'none',
      bearerToken: '',
      basicUsername: '',
      basicPassword: '',
      apiKeyName: '',
      apiKeyValue: '',
      apiKeyIn: 'header'
    };
  }

  S._requestTimeoutMs = 30000;
  S._requestAuthState = createDefaultRequestAuthState();
  S._requestAuthEndpointId = '';

  function normalizeVariableMetadata(variable) {
    return {
      key: typeof variable?.key === 'string' ? variable.key : '',
      value: typeof variable?.value === 'string' ? variable.value : '',
      description: typeof variable?.description === 'string' ? variable.description : '',
      type: variable?.type === 'secret' || variable?.type === 'url' || variable?.type === 'text'
        ? variable.type
        : 'text',
      isSecret: Boolean(variable?.isSecret)
    };
  }

  function renderVariableTokens(text) {
    const escapedText = S.escapeHtml(text || '');
    return escapedText.replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, function(match) {
      return '<span class="variable-token">' + match + '</span>';
    });
  }

  function updateVariableOverlay(input) {
    const wrapper = input.closest('.variable-overlay-wrapper');
    if (!wrapper) return;

    const backdrop = wrapper.querySelector('.variable-overlay-backdrop');
    if (!backdrop) return;

    backdrop.innerHTML = renderVariableTokens(input.value) + '<span class="variable-overlay-spacer"> </span>';
    backdrop.scrollLeft = input.scrollLeft;
    backdrop.scrollTop = input.scrollTop;
  }

  function removeVariableOverlayWrapper(input) {
    if (!input) return;

    const wrapper = input.closest('.variable-overlay-wrapper');
    input.classList.remove('variable-overlay-input');
    delete input.dataset.variableOverlayBound;

    if (!wrapper || !wrapper.parentNode) {
      return;
    }

    wrapper.parentNode.insertBefore(input, wrapper);
    wrapper.remove();
  }

  function getVariableFieldElements() {
    return Array.from(document.querySelectorAll([
      '#base-url',
      '#req-path-params input[type="text"]',
      '#req-query-params-table input[type="text"]',
      '#req-headers-table input[type="text"]',
      '#req-cookies-table input[type="text"]',
      '#req-auth-tab input[type="text"]',
      '#req-auth-tab input[type="password"]',
      '#request-body-json-editor',
      '#request-body-raw-editor',
      '.kv-name-input',
      '.kv-value-input'
    ].join(',')));
  }

  function getTokenContext(value, cursorPosition) {
    if (!value || cursorPosition < 2) return null;

    const tokenStart = value.lastIndexOf('{{', cursorPosition - 1);
    if (tokenStart === -1) return null;

    const tokenPrefix = value.slice(tokenStart + 2, cursorPosition);
    if (/[{}\s]/.test(tokenPrefix)) return null;

    const closedIndex = value.indexOf('}}', tokenStart + 2);
    if (closedIndex !== -1 && closedIndex < cursorPosition) {
      return null;
    }

    return {
      tokenStart,
      tokenEnd: cursorPosition,
      tokenPrefix
    };
  }

  function ensureAutocompleteElement() {
    if (S._variableAutocomplete.element) {
      return S._variableAutocomplete.element;
    }

    const element = document.createElement('div');
    element.id = 'variable-autocomplete';
    element.className = 'variable-autocomplete hidden';
    document.body.appendChild(element);

    S._variableAutocomplete.element = element;
    return element;
  }

  function hideVariableAutocomplete() {
    const autocomplete = S._variableAutocomplete;
    autocomplete.isVisible = false;
    autocomplete.activeInput = null;
    autocomplete.tokenStart = -1;
    autocomplete.tokenEnd = -1;
    autocomplete.activeIndex = 0;
    autocomplete.suggestions = [];

    if (autocomplete.element) {
      autocomplete.element.classList.add('hidden');
      autocomplete.element.innerHTML = '';
    }
  }

  function filterVariableSuggestions(prefix) {
    const normalizedPrefix = (prefix || '').toLowerCase();
    return S._environmentVariables.filter(function(variable) {
      return variable.key && variable.key.toLowerCase().startsWith(normalizedPrefix);
    });
  }

  function positionAutocomplete(autocompleteElement, input) {
    const rect = input.getBoundingClientRect();
    const maxWidth = Math.max(rect.width, 220);

    autocompleteElement.style.position = 'fixed';
    autocompleteElement.style.top = `${rect.bottom + 4}px`;
    autocompleteElement.style.left = `${rect.left}px`;
    autocompleteElement.style.minWidth = `${maxWidth}px`;
    autocompleteElement.style.maxWidth = `${Math.max(maxWidth, 340)}px`;
    autocompleteElement.style.zIndex = '1100';
  }

  function renderAutocompleteItems() {
    const autocomplete = S._variableAutocomplete;
    const element = ensureAutocompleteElement();
    element.innerHTML = '';

    if (!autocomplete.suggestions.length) {
      const empty = document.createElement('div');
      empty.className = 'variable-autocomplete-empty';
      empty.textContent = 'No variables found';
      element.appendChild(empty);
      return;
    }

    autocomplete.suggestions.forEach(function(variable, index) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `variable-autocomplete-item${index === autocomplete.activeIndex ? ' active' : ''}`;
      item.innerHTML = `
        <span class="variable-autocomplete-key">${S.escapeHtml(variable.key)}</span>
        <span class="variable-autocomplete-meta">${S.escapeHtml(variable.type || 'text')}</span>
      `;
      item.addEventListener('mousedown', function(event) {
        event.preventDefault();
      });
      item.addEventListener('click', function() {
        S.applyVariableSuggestion(variable.key);
      });
      element.appendChild(item);
    });
  }

  function showVariableAutocomplete(input, tokenContext) {
    const suggestions = filterVariableSuggestions(tokenContext.tokenPrefix);
    if (!suggestions.length) {
      hideVariableAutocomplete();
      return;
    }

    const autocomplete = S._variableAutocomplete;
    autocomplete.isVisible = true;
    autocomplete.activeInput = input;
    autocomplete.tokenStart = tokenContext.tokenStart;
    autocomplete.tokenEnd = tokenContext.tokenEnd;
    autocomplete.activeIndex = 0;
    autocomplete.suggestions = suggestions;

    const element = ensureAutocompleteElement();
    element.classList.remove('hidden');

    renderAutocompleteItems();
    positionAutocomplete(element, input);
  }

  function maybeOpenVariableAutocomplete(input) {
    if (!input || typeof input.selectionStart !== 'number') {
      hideVariableAutocomplete();
      return;
    }

    const context = getTokenContext(input.value, input.selectionStart);
    if (!context) {
      hideVariableAutocomplete();
      return;
    }

    showVariableAutocomplete(input, context);
  }

  S.applyVariableSuggestion = function(variableKey) {
    const autocomplete = S._variableAutocomplete;
    const input = autocomplete.activeInput;
    if (!input) {
      hideVariableAutocomplete();
      return;
    }

    const before = input.value.slice(0, autocomplete.tokenStart);
    const after = input.value.slice(autocomplete.tokenEnd);
    const nextValue = `${before}{{${variableKey}}}${after}`;
    const nextCursor = (before + `{{${variableKey}}}`).length;

    input.value = nextValue;
    input.focus();
    input.setSelectionRange(nextCursor, nextCursor);
    updateVariableOverlay(input);
    hideVariableAutocomplete();
  };

  function handleAutocompleteKeydown(event) {
    const autocomplete = S._variableAutocomplete;
    if (!autocomplete.isVisible) {
      return false;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      autocomplete.activeIndex = Math.min(autocomplete.activeIndex + 1, autocomplete.suggestions.length - 1);
      renderAutocompleteItems();
      return true;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      autocomplete.activeIndex = Math.max(autocomplete.activeIndex - 1, 0);
      renderAutocompleteItems();
      return true;
    }

    if (event.key === 'Enter') {
      if (!autocomplete.suggestions.length) {
        return false;
      }
      event.preventDefault();
      const selected = autocomplete.suggestions[autocomplete.activeIndex];
      if (selected) {
        S.applyVariableSuggestion(selected.key);
      }
      return true;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      hideVariableAutocomplete();
      return true;
    }

    return false;
  }

  function bindVariableField(input) {
    if (!input || input.dataset.variableOverlayBound === 'true') {
      return;
    }

    removeVariableOverlayWrapper(input);
    input.dataset.variableOverlayBound = 'true';

    input.addEventListener('input', function() {
      maybeOpenVariableAutocomplete(input);
    });

    input.addEventListener('click', function() {
      maybeOpenVariableAutocomplete(input);
    });

    input.addEventListener('keyup', function(event) {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Backspace' || event.key === 'Delete') {
        maybeOpenVariableAutocomplete(input);
      }
    });

    input.addEventListener('keydown', function(event) {
      if (handleAutocompleteKeydown(event)) {
        return;
      }
    });

    input.addEventListener('scroll', function() {
      maybeOpenVariableAutocomplete(input);
    });
  }

  S.setupVariableFieldEnhancements = function() {
    getVariableFieldElements().forEach(function(field) {
      bindVariableField(field);
    });
  };

  S.handleEnvironmentSelectionChange = function(environmentId) {
    S.vscode.postMessage({
      type: 'setActiveEnvironment',
      payload: {
        id: environmentId || undefined
      }
    });
  };

  function buildDefaultRequestUrl(endpoint, servers) {
    const endpointPath = endpoint && endpoint.path ? endpoint.path : '';
    const serverList = Array.isArray(servers) ? servers : [];
    const defaultBase = S._activeEnvironmentBaseUrl
      ? '{{baseUrl}}'
      : (serverList.length > 0 ? serverList[0].url : '{{baseUrl}}');

    return defaultBase.replace(/\/$/, '') + endpointPath;
  }

  function toTemplateRequestUrl(urlValue) {
    const value = typeof urlValue === 'string' ? urlValue : '';
    const normalizedBaseUrl = (S._activeEnvironmentBaseUrl || '').replace(/\/$/, '');
    if (!value || !normalizedBaseUrl) {
      return value;
    }

    if (!value.startsWith(normalizedBaseUrl)) {
      return value;
    }

    const nextChar = value.charAt(normalizedBaseUrl.length);
    if (value.length === normalizedBaseUrl.length || nextChar === '/' || nextChar === '?' || nextChar === '#') {
      return '{{baseUrl}}' + value.slice(normalizedBaseUrl.length);
    }

    return value;
  }

  function resolveRequestUrlVariables(urlValue) {
    const value = typeof urlValue === 'string' ? urlValue : '';
    if (!value) {
      return '';
    }

    const variableMap = {};
    (S._environmentVariables || []).forEach(function(variable) {
      if (variable?.key) {
        variableMap[variable.key] = variable.value || '';
      }
    });

    return value.replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, function(match, variableName) {
      if (variableName.toLowerCase() === 'baseurl' && S._activeEnvironmentBaseUrl) {
        return S._activeEnvironmentBaseUrl;
      }
      if (Object.prototype.hasOwnProperty.call(variableMap, variableName)) {
        return variableMap[variableName];
      }
      return match;
    });
  }

  function collectPathParamValues() {
    const result = {};
    const container = document.getElementById('req-path-params');
    if (!container) {
      return result;
    }

    container.querySelectorAll('input[data-param]').forEach(function(input) {
      const key = input.dataset.param;
      if (!key) {
        return;
      }
      result[key] = input.value || '';
    });

    return result;
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function resolvePathParamsInUrl(urlValue) {
    let value = typeof urlValue === 'string' ? urlValue : '';
    if (!value) {
      return '';
    }

    const pathParams = collectPathParamValues();
    Object.entries(pathParams).forEach(function([key, rawValue]) {
      if (!key) {
        return;
      }
      if (typeof rawValue !== 'string' || rawValue.trim() === '') {
        return;
      }
      const encodedValue = encodeURIComponent(rawValue);
      const pattern = new RegExp(`(^|[^\\{])\\{${escapeRegExp(key)}\\}(?!\\})`, 'g');
      value = value.replace(pattern, function(_match, prefix) {
        return `${prefix}${encodedValue}`;
      });
    });

    return value;
  }

  function syncRequestUrlInputDisplay(input) {
    if (!input) {
      return;
    }

    const templateValue = S._requestUrlTemplate || '';
    if (document.activeElement === input) {
      input.value = templateValue;
      return;
    }

    const withEnv = resolveRequestUrlVariables(templateValue);
    input.value = resolvePathParamsInUrl(withEnv);
  }

  S.updateEnvironmentVariables = function(variables, activeBaseUrl) {
    const environmentVariables = (variables || []).map(normalizeVariableMetadata).filter(function(variable) {
      return variable.key;
    });
    S._activeEnvironmentBaseUrl = typeof activeBaseUrl === 'string' ? activeBaseUrl : '';

    const hasBaseUrlVariable = environmentVariables.some(function(variable) {
      return variable.key.toLowerCase() === 'baseurl';
    });

    if (S._activeEnvironmentBaseUrl && !hasBaseUrlVariable) {
      environmentVariables.push({
        key: 'baseUrl',
        value: S._activeEnvironmentBaseUrl,
        description: 'Active environment base URL',
        type: 'url',
        isSecret: false
      });
    }

    S._environmentVariables = environmentVariables;

    const requestUrlInput = document.getElementById('base-url');
    if (requestUrlInput) {
      if (!S._requestUrlTemplate && requestUrlInput.value.trim()) {
        S._requestUrlTemplate = toTemplateRequestUrl(requestUrlInput.value);
      }
      if (!S._requestUrlTemplate && S.currentEndpoint) {
        S._requestUrlTemplate = buildDefaultRequestUrl(S.currentEndpoint, S._requestEndpointServers);
      }
      syncRequestUrlInputDisplay(requestUrlInput);
    }
    S.setupVariableFieldEnhancements();

    if (S._variableAutocomplete.isVisible && S._variableAutocomplete.activeInput) {
      maybeOpenVariableAutocomplete(S._variableAutocomplete.activeInput);
    }

    S.updateRequestUrlPreview();
  };

  document.addEventListener('mousedown', function(event) {
    const autocompleteElement = S._variableAutocomplete.element;
    const activeInput = S._variableAutocomplete.activeInput;
    if (!autocompleteElement || !S._variableAutocomplete.isVisible) {
      return;
    }

    const clickedInsideAutocomplete = autocompleteElement.contains(event.target);
    const clickedInsideInput = activeInput ? activeInput.contains(event.target) || activeInput === event.target : false;
    if (!clickedInsideAutocomplete && !clickedInsideInput) {
      hideVariableAutocomplete();
    }
  });

  document.addEventListener('mousedown', function(event) {
    const autocompleteElement = S._requestHeaderKeyAutocomplete.element;
    const activeInput = S._requestHeaderKeyAutocomplete.activeInput;
    if (!autocompleteElement || !S._requestHeaderKeyAutocomplete.isVisible) {
      return;
    }

    const clickedInsideAutocomplete = autocompleteElement.contains(event.target);
    const clickedInsideInput = activeInput ? activeInput.contains(event.target) || activeInput === event.target : false;
    if (!clickedInsideAutocomplete && !clickedInsideInput) {
      hideRequestHeaderKeyAutocomplete();
    }
  });

  window.addEventListener('resize', function() {
    repositionRequestHeaderKeyAutocompleteIfNeeded();
  });

  document.addEventListener('scroll', function() {
    repositionRequestHeaderKeyAutocompleteIfNeeded();
  }, true);

  function normalizeParameterValue(value) {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return '';
      }
    }
    return String(value);
  }

  function isHeadersParamTable(tableBody) {
    if (!tableBody || typeof tableBody.closest !== 'function') {
      return false;
    }

    const ownerTable = tableBody.closest('table');
    return ownerTable ? ownerTable.id === 'req-headers-table' : false;
  }

  function ensureRequestHeaderKeyAutocompleteElement() {
    if (S._requestHeaderKeyAutocomplete.element) {
      return S._requestHeaderKeyAutocomplete.element;
    }

    const element = document.createElement('div');
    element.id = REQUEST_HEADER_KEY_AUTOCOMPLETE_ID;
    element.className = 'request-header-key-autocomplete hidden';
    document.body.appendChild(element);

    S._requestHeaderKeyAutocomplete.element = element;
    return element;
  }

  function filterRequestHeaderKeySuggestions(searchText) {
    const normalizedSearch = (searchText || '').trim().toLowerCase();
    if (!normalizedSearch) {
      return REQUEST_HEADER_KEY_SUGGESTIONS.slice();
    }

    return REQUEST_HEADER_KEY_SUGGESTIONS.filter(function(headerKey) {
      return headerKey.toLowerCase().includes(normalizedSearch);
    });
  }

  function positionRequestHeaderKeyAutocomplete(element, input) {
    const inputRect = input.getBoundingClientRect();
    const viewportPadding = 8;
    const maxWidth = Math.max(inputRect.width, 220);
    const dropdownHeight = Math.min(element.scrollHeight || 0, 220) || 40;
    const spaceBelow = window.innerHeight - inputRect.bottom - viewportPadding;
    const spaceAbove = inputRect.top - viewportPadding;
    const showAbove = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
    const safeLeft = Math.max(viewportPadding, Math.min(inputRect.left, window.innerWidth - maxWidth - viewportPadding));
    const preferredTop = showAbove
      ? inputRect.top - dropdownHeight - 4
      : inputRect.bottom + 4;
    const safeTop = Math.max(viewportPadding, Math.min(preferredTop, window.innerHeight - dropdownHeight - viewportPadding));

    element.style.position = 'fixed';
    element.style.minWidth = `${maxWidth}px`;
    element.style.maxWidth = `${Math.max(maxWidth, 340)}px`;
    element.style.left = `${safeLeft}px`;
    element.style.top = `${safeTop}px`;
    element.style.zIndex = '1100';
  }

  function renderRequestHeaderKeyAutocompleteItems() {
    const autocomplete = S._requestHeaderKeyAutocomplete;
    const element = ensureRequestHeaderKeyAutocompleteElement();
    element.innerHTML = '';

    if (!autocomplete.suggestions.length) {
      const empty = document.createElement('div');
      empty.className = 'request-header-key-autocomplete-empty';
      empty.textContent = 'No matching headers';
      element.appendChild(empty);
      return;
    }

    autocomplete.suggestions.forEach(function(headerKey, index) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `request-header-key-autocomplete-item${index === autocomplete.activeIndex ? ' active' : ''}`;
      item.textContent = headerKey;
      item.addEventListener('mousedown', function(event) {
        event.preventDefault();
      });
      item.addEventListener('click', function() {
        applyRequestHeaderKeySuggestion(headerKey);
      });
      element.appendChild(item);
    });
  }

  function hideRequestHeaderKeyAutocomplete() {
    const autocomplete = S._requestHeaderKeyAutocomplete;
    const activeInput = autocomplete.activeInput;

    autocomplete.isVisible = false;
    autocomplete.activeInput = null;
    autocomplete.activeIndex = -1;
    autocomplete.suggestions = [];

    if (activeInput) {
      activeInput.removeAttribute('aria-expanded');
      activeInput.removeAttribute('aria-controls');
    }

    if (autocomplete.element) {
      autocomplete.element.classList.add('hidden');
      autocomplete.element.innerHTML = '';
    }
  }

  function showRequestHeaderKeyAutocomplete(input) {
    if (!input || !input.classList.contains('req-header-key-input')) {
      hideRequestHeaderKeyAutocomplete();
      return;
    }

    const autocomplete = S._requestHeaderKeyAutocomplete;
    const previousInput = autocomplete.activeInput;
    if (previousInput && previousInput !== input) {
      previousInput.removeAttribute('aria-expanded');
      previousInput.removeAttribute('aria-controls');
    }

    const suggestions = filterRequestHeaderKeySuggestions(input.value);
    if (!suggestions.length) {
      hideRequestHeaderKeyAutocomplete();
      return;
    }

    autocomplete.isVisible = true;
    autocomplete.activeInput = input;
    autocomplete.suggestions = suggestions;
    autocomplete.activeIndex = autocomplete.suggestions.length ? 0 : -1;

    const element = ensureRequestHeaderKeyAutocompleteElement();
    element.classList.remove('hidden');

    renderRequestHeaderKeyAutocompleteItems();
    positionRequestHeaderKeyAutocomplete(element, input);

    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-controls', REQUEST_HEADER_KEY_AUTOCOMPLETE_ID);
  }

  function applyRequestHeaderKeySuggestion(headerKey) {
    const autocomplete = S._requestHeaderKeyAutocomplete;
    const input = autocomplete.activeInput;
    if (!input) {
      hideRequestHeaderKeyAutocomplete();
      return;
    }

    input.value = headerKey;
    input.focus();
    if (typeof input.setSelectionRange === 'function') {
      const cursorPosition = headerKey.length;
      input.setSelectionRange(cursorPosition, cursorPosition);
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    hideRequestHeaderKeyAutocomplete();
  }

  function handleRequestHeaderKeyAutocompleteKeydown(event) {
    const autocomplete = S._requestHeaderKeyAutocomplete;
    if (!autocomplete.isVisible || autocomplete.activeInput !== event.target) {
      return false;
    }

    if (event.key === 'ArrowDown') {
      if (!autocomplete.suggestions.length) {
        return false;
      }
      event.preventDefault();
      autocomplete.activeIndex = Math.min(autocomplete.activeIndex + 1, autocomplete.suggestions.length - 1);
      renderRequestHeaderKeyAutocompleteItems();
      return true;
    }

    if (event.key === 'ArrowUp') {
      if (!autocomplete.suggestions.length) {
        return false;
      }
      event.preventDefault();
      autocomplete.activeIndex = Math.max(autocomplete.activeIndex - 1, 0);
      renderRequestHeaderKeyAutocompleteItems();
      return true;
    }

    if (event.key === 'Enter') {
      if (autocomplete.activeIndex < 0 || !autocomplete.suggestions[autocomplete.activeIndex]) {
        return false;
      }
      event.preventDefault();
      applyRequestHeaderKeySuggestion(autocomplete.suggestions[autocomplete.activeIndex]);
      return true;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      hideRequestHeaderKeyAutocomplete();
      return true;
    }

    return false;
  }

  function bindRequestHeaderKeyInput(input) {
    if (!input || input.dataset.headerKeyAutocompleteBound === 'true') {
      return;
    }

    input.dataset.headerKeyAutocompleteBound = 'true';
    input.addEventListener('focus', function() {
      showRequestHeaderKeyAutocomplete(input);
    });
    input.addEventListener('click', function() {
      showRequestHeaderKeyAutocomplete(input);
    });
    input.addEventListener('input', function() {
      showRequestHeaderKeyAutocomplete(input);
    });
    input.addEventListener('keydown', function(event) {
      if (event.defaultPrevented) {
        return;
      }
      if (handleRequestHeaderKeyAutocompleteKeydown(event)) {
        return;
      }
      if (event.key === 'Tab') {
        hideRequestHeaderKeyAutocomplete();
      }
    });
  }

  function repositionRequestHeaderKeyAutocompleteIfNeeded() {
    const autocomplete = S._requestHeaderKeyAutocomplete;
    if (!autocomplete.isVisible) {
      return;
    }

    if (!autocomplete.activeInput || !autocomplete.activeInput.isConnected) {
      hideRequestHeaderKeyAutocomplete();
      return;
    }

    const element = ensureRequestHeaderKeyAutocompleteElement();
    positionRequestHeaderKeyAutocomplete(element, autocomplete.activeInput);
  }

  function getInitialParameterValue(paramDef) {
    if (!paramDef) return '';
    if (paramDef.example !== undefined) return normalizeParameterValue(paramDef.example);
    if (paramDef.schema && paramDef.schema.default !== undefined) return normalizeParameterValue(paramDef.schema.default);
    return '';
  }

  function extractRequestParamRow(row) {
    const checkbox = row.querySelector('input[type="checkbox"]');
    if (!checkbox) return null;

    const customKeyInput = row.querySelector('.req-custom-key');
    const keyCell = row.querySelector('.req-param-key');
    const key = customKeyInput
      ? customKeyInput.value.trim()
      : (keyCell ? keyCell.textContent.replace(/\s*\*\s*$/, '').trim() : '');
    const valueInput = row.querySelectorAll('input[type="text"]')[customKeyInput ? 1 : 0];
    const value = valueInput ? valueInput.value : '';

    return {
      key,
      value,
      enabled: checkbox.checked
    };
  }

  function collectRequestParams(tableId) {
    const collected = [];
    const table = document.getElementById(tableId);
    if (!table) return collected;

    table.querySelectorAll('tbody tr').forEach(function(row) {
      const rowData = extractRequestParamRow(row);
      if (rowData && rowData.key) {
        collected.push(rowData);
      }
    });

    return collected;
  }

  function splitRequestUrlParts(rawUrl) {
    const value = typeof rawUrl === 'string' ? rawUrl : '';
    const hashIndex = value.indexOf('#');
    const hashPart = hashIndex === -1 ? '' : value.slice(hashIndex);
    const withoutHash = hashIndex === -1 ? value : value.slice(0, hashIndex);
    const queryIndex = withoutHash.indexOf('?');

    return {
      basePart: queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex),
      queryPart: queryIndex === -1 ? '' : withoutHash.slice(queryIndex + 1),
      hashPart
    };
  }

  function upsertHeaderParam(headers, key, value) {
    const normalized = key.toLowerCase();
    const existing = headers.find(function(header) {
      return header.key.toLowerCase() === normalized;
    });
    if (existing) {
      existing.value = value;
      existing.enabled = true;
      return;
    }
    headers.push({ key, value, enabled: true });
  }

  function upsertQueryParam(queryParams, key, value) {
    const normalized = key.toLowerCase();
    const existing = queryParams.find(function(param) {
      return param.key.toLowerCase() === normalized;
    });
    if (existing) {
      existing.value = value;
      existing.enabled = true;
      return;
    }
    queryParams.push({ key, value, enabled: true });
  }

  function encodeBasicCredentials(rawValue) {
    try {
      return btoa(rawValue);
    } catch {
      const bytes = new TextEncoder().encode(rawValue);
      let binary = '';
      bytes.forEach(function(byte) {
        binary += String.fromCharCode(byte);
      });
      return btoa(binary);
    }
  }

  S.clearRequestValidationError = function() {
    const messageEl = document.getElementById('request-validation-message');
    if (!messageEl) return;
    messageEl.textContent = '';
    messageEl.style.display = 'none';
  };

  S.showRequestValidationError = function(message, tabName) {
    const messageEl = document.getElementById('request-validation-message');
    if (messageEl) {
      messageEl.textContent = message;
      messageEl.style.display = 'block';
    }
    if (tabName) {
      S.switchRequestTab(tabName);
    }
  };

  S.updateRequestUrlPreview = function() {
    const requestUrlInput = document.getElementById('base-url');
    if (!requestUrlInput) {
      return;
    }

    const currentTemplateUrl = document.activeElement === requestUrlInput
      ? requestUrlInput.value
      : (S._requestUrlTemplate || toTemplateRequestUrl(requestUrlInput.value));

    if (!currentTemplateUrl.trim()) {
      S._requestUrlTemplate = '';
      return;
    }

    const urlParts = splitRequestUrlParts(currentTemplateUrl);
    const queryParams = collectRequestParams('req-query-params-table').filter(function(param) {
      return param.enabled && param.key;
    });
    const authState = S._requestAuthState || {};

    if (authState.type === 'api-key' && authState.apiKeyIn === 'query' && authState.apiKeyName) {
      upsertQueryParam(queryParams, authState.apiKeyName, authState.apiKeyValue || '');
    }

    const queryString = queryParams
      .map(function(param) {
        return `${encodeURIComponent(param.key)}=${encodeURIComponent(param.value || '')}`;
      })
      .join('&');

    S._requestUrlTemplate = urlParts.basePart + (queryString ? `?${queryString}` : '') + urlParts.hashPart;
    syncRequestUrlInputDisplay(requestUrlInput);
  };

  S._renderRequestAuthFields = function() {
    const fieldsContainer = document.getElementById('req-auth-fields');
    const authTypeSelect = document.getElementById('req-auth-type');
    if (!fieldsContainer || !authTypeSelect) return;

    const state = S._requestAuthState;
    const authType = authTypeSelect.value || 'none';
    state.type = authType;

    if (authType === 'none') {
      fieldsContainer.innerHTML = '<div class="auth-help-text" style="font-size:11px; color:var(--vscode-descriptionForeground);">No authorization will be added.</div>';
      S.updateRequestUrlPreview();
      return;
    }

    if (authType === 'bearer') {
      fieldsContainer.innerHTML = `
        <div class="auth-row" style="display:flex; align-items:center; gap:8px;">
          <label for="req-auth-bearer-token" style="min-width:100px; font-size:12px; color:var(--vscode-descriptionForeground);">Token</label>
          <input type="text" id="req-auth-bearer-token" placeholder="Enter bearer token" style="flex:1;">
        </div>
        <div class="auth-help-text" style="font-size:11px; color:var(--vscode-descriptionForeground);">Adds <code>Authorization: Bearer &lt;token&gt;</code> to headers.</div>
      `;

      const tokenInput = document.getElementById('req-auth-bearer-token');
      tokenInput.value = state.bearerToken || '';
      tokenInput.addEventListener('input', function() {
        state.bearerToken = tokenInput.value;
        S.clearRequestValidationError();
      });
    } else if (authType === 'basic') {
      fieldsContainer.innerHTML = `
        <div class="auth-row" style="display:flex; align-items:center; gap:8px;">
          <label for="req-auth-basic-username" style="min-width:100px; font-size:12px; color:var(--vscode-descriptionForeground);">Username</label>
          <input type="text" id="req-auth-basic-username" placeholder="Enter username" style="flex:1;">
        </div>
        <div class="auth-row" style="display:flex; align-items:center; gap:8px;">
          <label for="req-auth-basic-password" style="min-width:100px; font-size:12px; color:var(--vscode-descriptionForeground);">Password</label>
          <input type="password" id="req-auth-basic-password" placeholder="Enter password" style="flex:1;">
        </div>
        <div class="auth-help-text" style="font-size:11px; color:var(--vscode-descriptionForeground);">Adds <code>Authorization: Basic &lt;base64(username:password)&gt;</code> to headers.</div>
      `;

      const usernameInput = document.getElementById('req-auth-basic-username');
      const passwordInput = document.getElementById('req-auth-basic-password');
      usernameInput.value = state.basicUsername || '';
      passwordInput.value = state.basicPassword || '';
      usernameInput.addEventListener('input', function() {
        state.basicUsername = usernameInput.value;
        S.clearRequestValidationError();
      });
      passwordInput.addEventListener('input', function() {
        state.basicPassword = passwordInput.value;
        S.clearRequestValidationError();
      });
    } else if (authType === 'api-key') {
      fieldsContainer.innerHTML = `
        <div class="auth-row" style="display:flex; align-items:center; gap:8px;">
          <label for="req-auth-api-key-name" style="min-width:100px; font-size:12px; color:var(--vscode-descriptionForeground);">Key</label>
          <input type="text" id="req-auth-api-key-name" placeholder="e.g. X-API-Key" style="flex:1;">
        </div>
        <div class="auth-row" style="display:flex; align-items:center; gap:8px;">
          <label for="req-auth-api-key-value" style="min-width:100px; font-size:12px; color:var(--vscode-descriptionForeground);">Value</label>
          <input type="text" id="req-auth-api-key-value" placeholder="Enter API key value" style="flex:1;">
        </div>
        <div class="auth-row" style="display:flex; align-items:center; gap:8px;">
          <label for="req-auth-api-key-in" style="min-width:100px; font-size:12px; color:var(--vscode-descriptionForeground);">Add To</label>
          <select id="req-auth-api-key-in" style="flex:1;">
            <option value="header">Header</option>
            <option value="query">Query Params</option>
          </select>
        </div>
      `;

      const keyNameInput = document.getElementById('req-auth-api-key-name');
      const keyValueInput = document.getElementById('req-auth-api-key-value');
      const keyInSelect = document.getElementById('req-auth-api-key-in');

      keyNameInput.value = state.apiKeyName || '';
      keyValueInput.value = state.apiKeyValue || '';
      keyInSelect.value = state.apiKeyIn || 'header';

      keyNameInput.addEventListener('input', function() {
        state.apiKeyName = keyNameInput.value;
        S.clearRequestValidationError();
        S.updateRequestUrlPreview();
      });
      keyValueInput.addEventListener('input', function() {
        state.apiKeyValue = keyValueInput.value;
        S.clearRequestValidationError();
        S.updateRequestUrlPreview();
      });
      keyInSelect.addEventListener('change', function() {
        state.apiKeyIn = keyInSelect.value;
        S.clearRequestValidationError();
        S.updateRequestUrlPreview();
      });
    }

    S.setupVariableFieldEnhancements();
    S.updateRequestUrlPreview();
  };

  S._ensureRequestBuilderBindings = function() {
    const baseUrlInput = document.getElementById('base-url');
    if (baseUrlInput && baseUrlInput.dataset.requestBound !== 'true') {
      baseUrlInput.dataset.requestBound = 'true';
      if (!S._requestUrlTemplate && baseUrlInput.value.trim()) {
        S._requestUrlTemplate = toTemplateRequestUrl(baseUrlInput.value);
      }
      baseUrlInput.addEventListener('focus', function() {
        if (!S._requestUrlTemplate && baseUrlInput.value.trim()) {
          S._requestUrlTemplate = toTemplateRequestUrl(baseUrlInput.value);
        }
        syncRequestUrlInputDisplay(baseUrlInput);
      });
      baseUrlInput.addEventListener('input', function() {
        S._requestUrlTemplate = baseUrlInput.value;
        S.clearRequestValidationError();
      });
      baseUrlInput.addEventListener('blur', function() {
        S._requestUrlTemplate = baseUrlInput.value;
        syncRequestUrlInputDisplay(baseUrlInput);
      });
    }

    const timeoutInput = document.getElementById('req-timeout-ms');
    if (timeoutInput && timeoutInput.dataset.requestBound !== 'true') {
      timeoutInput.dataset.requestBound = 'true';
      timeoutInput.addEventListener('input', function() {
        S.clearRequestValidationError();
      });
    }

    const pathParamsContainer = document.getElementById('req-path-params');
    if (pathParamsContainer && pathParamsContainer.dataset.requestBound !== 'true') {
      pathParamsContainer.dataset.requestBound = 'true';
      pathParamsContainer.addEventListener('input', function() {
        S.clearRequestValidationError();
        S.updateRequestUrlPreview();
      });
    }

    const queryParamsTable = document.getElementById('req-query-params-table');
    if (queryParamsTable && queryParamsTable.dataset.requestBound !== 'true') {
      queryParamsTable.dataset.requestBound = 'true';
      queryParamsTable.addEventListener('input', function() {
        S.clearRequestValidationError();
        S.updateRequestUrlPreview();
      });
      queryParamsTable.addEventListener('change', function() {
        S.clearRequestValidationError();
        S.updateRequestUrlPreview();
      });
    }

    const authTypeSelect = document.getElementById('req-auth-type');
    if (authTypeSelect && authTypeSelect.dataset.requestBound !== 'true') {
      authTypeSelect.dataset.requestBound = 'true';
      authTypeSelect.addEventListener('change', function() {
        S.clearRequestValidationError();
        S._renderRequestAuthFields();
      });
    }
  };

  S._applyRequestAuth = function(queryParams, headers) {
    const authState = S._requestAuthState || { type: 'none' };

    if (authState.type === 'none') {
      return { ok: true };
    }

    if (authState.type === 'bearer') {
      const token = (authState.bearerToken || '').trim();
      if (!token) {
        return { ok: false, message: 'Bearer token is required.', tab: 'auth' };
      }
      upsertHeaderParam(headers, 'Authorization', `Bearer ${token}`);
      return { ok: true };
    }

    if (authState.type === 'basic') {
      const username = authState.basicUsername || '';
      const password = authState.basicPassword || '';
      if (!username.trim() && !password.trim()) {
        return { ok: false, message: 'Username or password is required for Basic Auth.', tab: 'auth' };
      }
      const encoded = encodeBasicCredentials(`${username}:${password}`);
      upsertHeaderParam(headers, 'Authorization', `Basic ${encoded}`);
      return { ok: true };
    }

    if (authState.type === 'api-key') {
      const keyName = (authState.apiKeyName || '').trim();
      const keyValue = authState.apiKeyValue || '';
      const keyIn = authState.apiKeyIn || 'header';

      if (!keyName) {
        return { ok: false, message: 'API key name is required.', tab: 'auth' };
      }
      if (!keyValue) {
        return { ok: false, message: 'API key value is required.', tab: 'auth' };
      }

      if (keyIn === 'query') {
        upsertQueryParam(queryParams, keyName, keyValue);
      } else {
        upsertHeaderParam(headers, keyName, keyValue);
      }

      return { ok: true };
    }

    return { ok: true };
  };

  S.setupRequestBuilder = function(endpoint, servers) {
    const escapeHtml = S.escapeHtml;
    const baseUrlInput = document.getElementById('base-url');
    const timeoutInput = document.getElementById('req-timeout-ms');

    hideRequestHeaderKeyAutocomplete();

    if (S._requestAuthEndpointId !== endpoint.id) {
      S._requestAuthState = createDefaultRequestAuthState();
      S._requestAuthEndpointId = endpoint.id;
    }

    S._requestEndpointServers = Array.isArray(servers) ? servers : [];
    S._requestUrlTemplate = buildDefaultRequestUrl(endpoint, S._requestEndpointServers);
    if (baseUrlInput) {
      removeVariableOverlayWrapper(baseUrlInput);
      syncRequestUrlInputDisplay(baseUrlInput);
      baseUrlInput.placeholder = '{{baseUrl}}/path/to/endpoint';
    }
    if (timeoutInput) {
      timeoutInput.value = String(S._requestTimeoutMs || 30000);
    }
    S.clearRequestValidationError();

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
        const initialValue = getInitialParameterValue(p);
        const div = document.createElement('div');
        div.className = 'path-param-row';
        div.innerHTML = `
          <label>${escapeHtml(p.name)} ${p.required ? '<span class="required-indicator">*</span>' : ''}</label>
          <input type="text" data-param="${escapeHtml(p.name)}" value="${escapeHtml(initialValue)}" placeholder="${escapeHtml(p.schema?.type || 'string')} ${p.description ? '- ' + escapeHtml(p.description) : ''}">
        `;
        pathParamsContainer.appendChild(div);
      });
    }

    // Populate query params
    const queryParamsTable = document.getElementById('req-query-params-table').querySelector('tbody');
    queryParamsTable.innerHTML = '';
    const queryParams = endpoint.parameters?.filter(p => p.in === 'query') || [];
    queryParams.forEach(p => {
      S.addRequestParamRow(queryParamsTable, p.name, getInitialParameterValue(p), true, p);
    });

    // Populate headers
    const headersTable = document.getElementById('req-headers-table').querySelector('tbody');
    headersTable.innerHTML = '';
    const headerParams = endpoint.parameters?.filter(p => p.in === 'header') || [];
    if (headerParams.length) {
      headerParams.forEach(p => {
        S.addRequestParamRow(headersTable, p.name, getInitialParameterValue(p), true, p);
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
        S.addRequestParamRow(cookiesTable, p.name, getInitialParameterValue(p), true, p);
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

    const authTypeSelect = document.getElementById('req-auth-type');
    if (authTypeSelect) {
      authTypeSelect.value = S._requestAuthState?.type || 'none';
      S._renderRequestAuthFields();
    }

    S._updateRequestTabBadges(endpoint);

    // Switch to params tab by default
    S.switchRequestTab('params');
    S._ensureRequestBuilderBindings();
    S.setupVariableFieldEnhancements();
    S.updateRequestUrlPreview();

    S.vscode.postMessage({ type: 'requestEnvironments' });
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
      else if (tab === 'auth') label = 'Auth';
      else if (tab === 'cookies') label = 'Cookies' + (cookieCount > 0 ? ' (' + cookieCount + ')' : '');
      else if (tab === 'settings') label = 'Settings';
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
    row.querySelector('.delete-btn').addEventListener('click', function() {
      row.remove();
      S.updateRequestUrlPreview();
    });
    table.appendChild(row);
    S.setupVariableFieldEnhancements();
    S.updateRequestUrlPreview();
  };

  S.addCustomParamRow = function(table) {
    // Remove "no params" message row if exists
    var emptyRow = table.querySelector('.no-params-message');
    if (emptyRow) {
      emptyRow.closest('tr').remove();
    }

    const row = document.createElement('tr');
    const isHeadersTable = isHeadersParamTable(table);
    const keyInputClassName = isHeadersTable ? 'req-custom-key req-header-key-input' : 'req-custom-key';
    row.innerHTML = `
      <td><input type="checkbox" checked></td>
      <td><input type="text" value="" placeholder="Key" class="${keyInputClassName}"></td>
      <td><input type="text" value="" placeholder="Value"></td>
      <td></td>
      <td><button class="delete-btn">×</button></td>
    `;
    const headerKeyInput = row.querySelector('.req-header-key-input');
    row.querySelector('.delete-btn').addEventListener('click', function() {
      if (headerKeyInput && S._requestHeaderKeyAutocomplete.activeInput === headerKeyInput) {
        hideRequestHeaderKeyAutocomplete();
      }
      row.remove();
      S.updateRequestUrlPreview();
    });
    table.appendChild(row);
    if (headerKeyInput) {
      bindRequestHeaderKeyInput(headerKeyInput);
    }
    S.setupVariableFieldEnhancements();
    S.updateRequestUrlPreview();
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
    const requestUrlInput = document.getElementById('base-url');
    const timeoutInput = document.getElementById('req-timeout-ms');

    S.clearRequestValidationError();

    const requestUrl = (S._requestUrlTemplate || toTemplateRequestUrl(requestUrlInput.value)).trim();
    if (!requestUrl) {
      S.showRequestValidationError('Request URL is required.', 'params');
      return null;
    }

    const requestUrlParts = splitRequestUrlParts(requestUrl);
    const requestUrlBase = requestUrlParts.basePart.trim();
    if (!requestUrlBase) {
      S.showRequestValidationError('Request URL is required.', 'params');
      return null;
    }

    var timeoutMs = S._requestTimeoutMs || 30000;
    if (timeoutInput) {
      const timeoutRaw = timeoutInput.value.trim();
      if (timeoutRaw) {
        const parsedTimeout = Number(timeoutRaw);
        if (!Number.isInteger(parsedTimeout) || parsedTimeout < 1) {
          S.showRequestValidationError('Timeout must be a whole number greater than 0.', 'settings');
          return null;
        }
        timeoutMs = parsedTimeout;
      }
    }
    S._requestTimeoutMs = timeoutMs;

    // Path params
    const pathParams = {};
    document.getElementById('req-path-params').querySelectorAll('input[data-param]').forEach(input => {
      pathParams[input.dataset.param] = input.value;
    });

    const requiredPathParams = S.currentEndpoint.parameters?.filter(p => p.in === 'path' && p.required) || [];
    for (const p of requiredPathParams) {
      const pathValue = pathParams[p.name];
      if (typeof pathValue !== 'string' || !pathValue.trim()) {
        S.showRequestValidationError(`Path parameter "${p.name}" is required.`, 'params');
        return null;
      }
    }

    // Query params
    const queryParams = collectRequestParams('req-query-params-table');
    if (requestUrlParts.queryPart) {
      const parsedQuery = new URLSearchParams(requestUrlParts.queryPart);
      parsedQuery.forEach(function(value, key) {
        if (!key) {
          return;
        }
        upsertQueryParam(queryParams, key, value);
      });
    }

    // Headers
    const headers = collectRequestParams('req-headers-table');

    // Cookies - build Cookie header from cookie params
    const cookieParams = collectRequestParams('req-cookies-table');
    const cookieParts = [];
    cookieParams.forEach(function(cookieParam) {
      const enabled = cookieParam.enabled;
      const key = cookieParam.key;
      const value = cookieParam.value;
      if (key && enabled) {
        cookieParts.push(`${key}=${value}`);
      }
    });
    if (cookieParts.length) {
      headers.push({ key: 'Cookie', value: cookieParts.join('; '), enabled: true });
    }

    const authResult = S._applyRequestAuth(queryParams, headers);
    if (!authResult.ok) {
      S.showRequestValidationError(authResult.message || 'Auth configuration is invalid.', authResult.tab || 'auth');
      return null;
    }

    const requiredQueryParams = S.currentEndpoint.parameters?.filter(p => p.in === 'query' && p.required) || [];
    for (const p of requiredQueryParams) {
      const matched = queryParams.find(function(queryParam) {
        return queryParam.key === p.name;
      });
      if (!matched || !matched.enabled || !matched.value.trim()) {
        S.showRequestValidationError(`Query parameter "${p.name}" is required.`, 'params');
        return null;
      }
    }

    const requiredHeaderParams = S.currentEndpoint.parameters?.filter(p => p.in === 'header' && p.required) || [];
    for (const p of requiredHeaderParams) {
      const matched = headers.find(function(headerParam) {
        return headerParam.key.toLowerCase() === p.name.toLowerCase();
      });
      if (!matched || !matched.enabled || !matched.value.trim()) {
        S.showRequestValidationError(`Header "${p.name}" is required.`, 'headers');
        return null;
      }
    }

    const requiredCookieParams = S.currentEndpoint.parameters?.filter(p => p.in === 'cookie' && p.required) || [];
    for (const p of requiredCookieParams) {
      const matched = cookieParams.find(function(cookieParam) {
        return cookieParam.key === p.name;
      });
      if (!matched || !matched.enabled || !matched.value.trim()) {
        S.showRequestValidationError(`Cookie "${p.name}" is required.`, 'cookies');
        return null;
      }
    }

    const auth = {
      type: S._requestAuthState.type || 'none',
      bearerToken: S._requestAuthState.bearerToken || '',
      basicUsername: S._requestAuthState.basicUsername || '',
      basicPassword: S._requestAuthState.basicPassword || '',
      apiKeyName: S._requestAuthState.apiKeyName || '',
      apiKeyValue: S._requestAuthState.apiKeyValue || '',
      apiKeyIn: S._requestAuthState.apiKeyIn || 'header'
    };

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
      requestUrl: requestUrlBase,
      baseUrl: '',
      path: '',
      method: S.currentEndpoint.method,
      pathParams,
      queryParams,
      headers,
      body: body,
      contentType: contentType,
      timeoutMs,
      auth
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

  function showCopiedTooltip(targetButton) {
    if (!(targetButton instanceof HTMLElement)) {
      return;
    }

    const existingTimer = targetButton.dataset.copiedTooltipTimer;
    if (existingTimer) {
      window.clearTimeout(Number(existingTimer));
    }

    targetButton.classList.add('show-copied-tooltip');
    const tooltipTimer = window.setTimeout(() => {
      targetButton.classList.remove('show-copied-tooltip');
      delete targetButton.dataset.copiedTooltipTimer;
    }, 1200);
    targetButton.dataset.copiedTooltipTimer = String(tooltipTimer);
  }

  function normalizeContentType(contentType) {
    if (typeof contentType !== 'string') {
      return '';
    }

    return contentType.split(';')[0].trim().toLowerCase();
  }

  function parseExampleValue(body, contentType) {
    if (typeof body !== 'string' || !contentType.includes('json')) {
      return body;
    }

    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }

  S.handleCopyCurlResult = function(success, message) {
    if (!S._pendingCopyCurlButton) {
      return;
    }

    const targetButton = S._pendingCopyCurlButton;
    S._pendingCopyCurlButton = null;

    if (success && message === 'cURL copied') {
      showCopiedTooltip(targetButton);
    }
  };

  S.copyResponse = function(event) {
    if (!S.lastResponse) {
      return;
    }

    const targetButton = event && event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    navigator.clipboard.writeText(S.lastResponse.body).then(() => {
      showCopiedTooltip(targetButton);
    }).catch((error) => {
      const message = error instanceof Error ? error.message : 'Failed to copy response';
      if (typeof S.showSaveStatus === 'function') {
        S.showSaveStatus(false, message);
      }
    });
  };

  S.copyCurl = function(event) {
      if (!S.currentEndpoint) return;

      const config = S.buildRequestConfig();
      if (!config) return;

      S._pendingCopyCurlButton = event && event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
      S.vscode.postMessage({ type: 'copyCurl', payload: config });
    };

  S.saveResponse = function() {
    if (!S.currentEndpoint || !S.lastResponse) {
      return;
    }

    const statusCode = String(S.lastResponse.status);
    const endpointResponses = Array.isArray(S.currentEndpoint.responses) ? S.currentEndpoint.responses : [];
    const existingResponse = endpointResponses.find(response => response.statusCode === statusCode);
    const sourceJson = existingResponse && existingResponse._source && typeof existingResponse._source === 'object'
      ? JSON.parse(JSON.stringify(existingResponse._source))
      : {};

    if (!sourceJson.description) {
      sourceJson.description = existingResponse?.description || `Response for status ${statusCode}`;
    }

    if (!sourceJson.content || typeof sourceJson.content !== 'object') {
      sourceJson.content = {};
    }

    const sourceContent = sourceJson.content;
    const sourceContentTypes = Object.keys(sourceContent);
    const existingContentTypes = existingResponse?.content ? Object.keys(existingResponse.content) : [];
    const normalizedContentType = normalizeContentType(S.lastResponse.contentType);
    const targetContentType = normalizedContentType || sourceContentTypes[0] || existingContentTypes[0] || 'application/json';

    if (!sourceContent[targetContentType] || typeof sourceContent[targetContentType] !== 'object') {
      sourceContent[targetContentType] = {};
    }

    sourceContent[targetContentType].example = parseExampleValue(S.lastResponse.body, targetContentType);

    S.vscode.postMessage({
      type: 'updateResponseSource',
      payload: {
        filePath: S.currentEndpoint.filePath,
        path: S.currentEndpoint.path,
        method: S.currentEndpoint.method,
        statusCode,
        sourceJson
      }
    });
  };


  S.updateEnvironments = function(environments, activeId) {
    if (Array.isArray(environments)) {
      S._lastEnvironments = environments.map(function(env) {
        return {
          id: env.id,
          name: env.name
        };
      });
    }
    S._lastActiveEnvironmentId = typeof activeId === 'string' ? activeId : undefined;

    const environmentSelect = document.getElementById('environment-select');
    if (!environmentSelect) {
      return;
    }

    const safeEnvironments = Array.isArray(S._lastEnvironments) ? S._lastEnvironments : [];
    environmentSelect.innerHTML = '<option value="">No Environment</option>';
    safeEnvironments.forEach(env => {
      const option = document.createElement('option');
      option.value = env.id;
      option.textContent = env.name;
      environmentSelect.appendChild(option);
    });

    environmentSelect.value = S._lastActiveEnvironmentId || '';
  };

  S.restoreEnvironmentSelector = function() {
    S.updateEnvironments(S._lastEnvironments, S._lastActiveEnvironmentId);

    if (!Array.isArray(S._lastEnvironments) || S._lastEnvironments.length === 0) {
      S.vscode.postMessage({ type: 'requestEnvironments' });
    }
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

    S.setupVariableFieldEnhancements();
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
      S.setupVariableFieldEnhancements();
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
