// Details tab logic for OpenAPI Puer webview
(function() {
  const S = window.OpenAPIPuer;

  S.showSaveStatus = function(success, message) {
    const notification = document.createElement('div');
    notification.className = `save-notification ${success ? 'success' : 'error'}`;
    notification.textContent = success ? 'Saved' : (message || 'Failed to save');
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }, 1500);
  };

  S.saveField = function(field, value) {
    if (!S.currentEndpoint) return;

    const updates = {};

    if (field === 'tags') {
      const tags = value ? value.split(',').map(t => t.trim()).filter(t => t) : [];
      updates.tags = tags.length > 0 ? tags : undefined;
    } else if (field === 'deprecated') {
      updates.deprecated = value || undefined;
    } else {
      updates[field] = value || undefined;
    }

    S.vscode.postMessage({
      type: 'updateOverview',
      payload: {
        filePath: S.currentEndpoint.filePath,
        path: S.currentEndpoint.path,
        method: S.currentEndpoint.method,
        updates
      }
    });

    if (field === 'tags') {
      S.currentEndpoint.tags = updates.tags;
    } else if (field === 'deprecated') {
      S.currentEndpoint.deprecated = updates.deprecated;
    } else {
      S.currentEndpoint[field] = updates[field];
    }
  };

  S.savePath = function(oldPath, newPath) {
    if (!S.currentEndpoint) return;

    S.vscode.postMessage({
      type: 'updatePath',
      payload: {
        filePath: S.currentEndpoint.filePath,
        oldPath: oldPath,
        newPath: newPath,
        method: S.currentEndpoint.method
      }
    });

    S.currentEndpoint.path = newPath;
  };

  S.saveMethod = function(oldMethod, newMethod) {
    if (!S.currentEndpoint) return;

    S.vscode.postMessage({
      type: 'updateMethod',
      payload: {
        filePath: S.currentEndpoint.filePath,
        path: S.currentEndpoint.path,
        oldMethod: oldMethod,
        newMethod: newMethod
      }
    });

    S.currentEndpoint.method = newMethod;
  };

  // Update query params preview for all HTTP methods
  S.updateQueryParamsPreview = function(endpoint) {
    const previewContainer = document.getElementById('query-params-preview');
    if (!previewContainer) return;

    // Clear previous content
    previewContainer.innerHTML = '';
    previewContainer.classList.remove('visible');

    if (!endpoint) {
      return;
    }

    // Get query parameters
    const queryParams = (endpoint.parameters || []).filter(p => p.in === 'query');
    if (queryParams.length === 0) {
      return;
    }

    const escapeHtml = S.escapeHtml;

    // Build the query string preview (displayed inline after path)
    const queryString = queryParams.map(p => {
      const name = escapeHtml(p.name);
      const placeholder = p.schema?.type || 'value';
      return `<span class="query-param-name">${name}</span>=<span class="query-param-value">{${escapeHtml(placeholder)}}</span>`;
    }).join('<span class="query-param-separator">&amp;</span>');

    previewContainer.innerHTML = `?${queryString}`;
    previewContainer.classList.add('visible');
  };

  S.createEditableField = function(label, field, value, isTextarea) {
    if (isTextarea === undefined) isTextarea = false;
    const row = document.createElement('div');
    row.className = 'meta-row';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'meta-label';
    labelSpan.textContent = label;

    const valueContainer = document.createElement('div');
    valueContainer.className = 'meta-value-container';

    const valueSpan = document.createElement('span');
    valueSpan.className = 'meta-value editable';
    valueSpan.textContent = value || '—';
    valueSpan.dataset.field = field;
    valueSpan.dataset.empty = !value;
    if (!value) valueSpan.classList.add('empty');

    valueSpan.addEventListener('click', () => {
      if (valueSpan.classList.contains('editing')) return;

      valueSpan.classList.add('editing');
      const currentValue = valueSpan.dataset.empty === 'true' ? '' : valueSpan.textContent;

      let input;
      if (isTextarea) {
        input = document.createElement('textarea');
        input.rows = 3;
      } else {
        input = document.createElement('input');
        input.type = 'text';
      }
      input.className = 'inline-edit-input';
      input.value = currentValue;
      input.placeholder = `Enter ${label.toLowerCase()}...`;

      valueSpan.textContent = '';
      valueSpan.appendChild(input);
      input.focus();
      input.select();

      const finishEdit = () => {
        const newValue = input.value.trim();
        valueSpan.classList.remove('editing');
        valueSpan.textContent = newValue || '—';
        valueSpan.dataset.empty = !newValue;
        if (!newValue) {
          valueSpan.classList.add('empty');
        } else {
          valueSpan.classList.remove('empty');
        }

        const oldValue = field === 'tags'
          ? (S.currentEndpoint.tags || []).join(', ')
          : (S.currentEndpoint[field] || '');
        if (newValue !== oldValue) {
          S.saveField(field, newValue);
        }
      };

      input.addEventListener('blur', finishEdit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !isTextarea) {
          e.preventDefault();
          input.blur();
        }
        if (e.key === 'Escape') {
          input.value = currentValue;
          input.blur();
        }
      });
    });

    valueContainer.appendChild(valueSpan);
    row.appendChild(labelSpan);
    row.appendChild(valueContainer);

    return row;
  };

  S.createDeprecatedField = function(deprecated) {
    const row = document.createElement('div');
    row.className = 'meta-row';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'meta-label';
    labelSpan.textContent = 'Deprecated';

    const valueContainer = document.createElement('div');
    valueContainer.className = 'meta-value-container';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'edit-deprecated';
    checkbox.checked = deprecated || false;
    checkbox.className = 'deprecated-checkbox';

    const checkboxLabel = document.createElement('label');
    checkboxLabel.htmlFor = 'edit-deprecated';
    checkboxLabel.className = 'deprecated-label';
    checkboxLabel.textContent = deprecated ? 'Yes' : 'No';

    checkbox.addEventListener('change', () => {
      checkboxLabel.textContent = checkbox.checked ? 'Yes' : 'No';
      S.saveField('deprecated', checkbox.checked);
    });

    valueContainer.appendChild(checkbox);
    valueContainer.appendChild(checkboxLabel);
    row.appendChild(labelSpan);
    row.appendChild(valueContainer);

    return row;
  };

  S.createTagsField = function(label, tags) {
    const escapeHtml = S.escapeHtml;
    const row = document.createElement('div');
    row.className = 'meta-row';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'meta-label';
    labelSpan.textContent = label;

    const valueContainer = document.createElement('div');
    valueContainer.className = 'meta-value-container';

    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'tags-container';

    let currentTags = [...tags];

    function renderTags() {
      tagsContainer.innerHTML = '';

      currentTags.forEach((tag, index) => {
        const tagEl = document.createElement('span');
        tagEl.className = 'tag-item';
        tagEl.innerHTML = `
          <span class="tag-text">${escapeHtml(tag)}</span>
          <button type="button" class="tag-remove" data-index="${index}">×</button>
        `;
        tagsContainer.appendChild(tagEl);
      });

      const addTagBtn = document.createElement('button');
      addTagBtn.type = 'button';
      addTagBtn.className = 'add-tag-btn';
      addTagBtn.textContent = '+ Add';
      addTagBtn.addEventListener('click', () => {
        showAddTagInput();
      });
      tagsContainer.appendChild(addTagBtn);

      tagsContainer.querySelectorAll('.tag-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const index = parseInt(btn.dataset.index);
          currentTags.splice(index, 1);
          S.saveField('tags', currentTags.join(', '));
          if (S.currentEndpoint) {
            S.currentEndpoint.tags = currentTags.length > 0 ? [...currentTags] : undefined;
          }
          renderTags();
        });
      });
    }

    function showAddTagInput() {
      const addBtn = tagsContainer.querySelector('.add-tag-btn');
      if (addBtn) {
        const inputWrapper = document.createElement('span');
        inputWrapper.className = 'tag-input-wrapper';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'tag-input';
        input.placeholder = 'Tag name';

        inputWrapper.appendChild(input);
        addBtn.replaceWith(inputWrapper);
        input.focus();

        const finishInput = () => {
          const value = input.value.trim();
          if (value && !currentTags.includes(value)) {
            currentTags.push(value);
            S.saveField('tags', currentTags.join(', '));
            if (S.currentEndpoint) {
              S.currentEndpoint.tags = [...currentTags];
            }
          }
          renderTags();
        };

        input.addEventListener('blur', finishInput);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
          }
          if (e.key === 'Escape') {
            input.value = '';
            input.blur();
          }
        });
      }
    }

    renderTags();

    valueContainer.appendChild(tagsContainer);
    row.appendChild(labelSpan);
    row.appendChild(valueContainer);

    return row;
  };

  S.createEditableTableCell = function(value, field, paramIndex, options) {
    if (options === undefined) options = null;
    const span = document.createElement('span');
    span.className = 'editable-cell';
    span.textContent = value || '—';
    span.dataset.field = field;
    span.dataset.paramIndex = paramIndex;
    if (!value) span.classList.add('empty');

    span.addEventListener('click', () => {
      if (span.classList.contains('editing')) return;

      span.classList.add('editing');
      const currentValue = span.classList.contains('empty') ? '' : span.textContent;

      let input;
      if (options) {
        input = document.createElement('select');
        input.className = 'inline-edit-select';
        options.forEach(opt => {
          const option = document.createElement('option');
          option.value = opt;
          option.textContent = opt;
          if (opt === currentValue) option.selected = true;
          input.appendChild(option);
        });
      } else {
        input = document.createElement('input');
        input.type = 'text';
        input.className = 'inline-edit-input';
        input.value = currentValue;
        input.placeholder = `Enter ${field}...`;
      }

      span.textContent = '';
      span.appendChild(input);
      input.focus();
      if (input.select) input.select();

      const finishEdit = () => {
        const newValue = input.value.trim();
        span.classList.remove('editing');
        span.textContent = newValue || '—';
        if (!newValue) {
          span.classList.add('empty');
        } else {
          span.classList.remove('empty');
        }

        if (newValue !== currentValue) {
          S.saveParameter(paramIndex, field, newValue);
        }
      };

      input.addEventListener('blur', finishEdit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        }
        if (e.key === 'Escape') {
          input.value = currentValue;
          input.blur();
        }
      });
    });

    return span;
  };

  S.createEditableParameterRow = function(param, index) {
    const row = document.createElement('tr');
    row.dataset.paramIndex = index;
    row.dataset.paramName = param.name;
    row.dataset.paramIn = param.in;

    const nameCell = document.createElement('td');
    const nameSpan = S.createEditableTableCell(param.name, 'name', index);
    nameSpan.classList.add('param-name');
    nameCell.appendChild(nameSpan);
    row.appendChild(nameCell);

    const locationCell = document.createElement('td');
    const locationSpan = S.createEditableTableCell(param.in, 'in', index, ['query', 'path', 'header', 'cookie']);
    locationSpan.classList.add('param-location');
    locationCell.appendChild(locationSpan);
    row.appendChild(locationCell);

    const typeCell = document.createElement('td');
    const typeSpan = S.createEditableTableCell(param.schema?.type || 'string', 'type', index, [
      'string', 'integer', 'number', 'boolean', 'array', 'object'
    ]);
    typeCell.appendChild(typeSpan);
    row.appendChild(typeCell);

    const requiredCell = document.createElement('td');
    const requiredCheckbox = document.createElement('input');
    requiredCheckbox.type = 'checkbox';
    requiredCheckbox.checked = param.required || false;
    requiredCheckbox.className = 'param-required-checkbox';
    requiredCheckbox.addEventListener('change', () => {
      S.saveParameter(index, 'required', requiredCheckbox.checked);
    });
    requiredCell.appendChild(requiredCheckbox);
    row.appendChild(requiredCell);

    const descCell = document.createElement('td');
    const descSpan = S.createEditableTableCell(param.description || '', 'description', index);
    descCell.appendChild(descSpan);
    row.appendChild(descCell);

    const actionsCell = document.createElement('td');
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'param-delete-btn';
    deleteBtn.innerHTML = '×';
    deleteBtn.title = 'Delete parameter';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      S.showDeleteConfirmDialog(param.name, () => {
        S.deleteParameter(index, param.name, param.in);
      });
    });
    actionsCell.appendChild(deleteBtn);
    row.appendChild(actionsCell);

    return row;
  };

  S.createEditableParametersTable = function(parameters) {
    const container = document.createElement('div');

    const table = document.createElement('table');
    table.className = 'params-table editable-table';

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Name</th><th>Location</th><th>Type</th><th>Required</th><th>Description</th><th></th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    tbody.id = 'params-tbody';
    parameters.forEach((param, index) => {
      const row = S.createEditableParameterRow(param, index);
      tbody.appendChild(row);
    });
    table.appendChild(tbody);

    container.appendChild(table);

    const addRow = document.createElement('div');
    addRow.className = 'add-param-row';
    const addBtn = document.createElement('button');
    addBtn.className = 'add-param-btn';
    addBtn.textContent = '+ Add Parameter';
    addBtn.addEventListener('click', () => S.showAddParameterDialog());
    addRow.appendChild(addBtn);
    container.appendChild(addRow);

    return container;
  };

  // Create a parameter table filtered by location(s)
  S.createFilteredParameterTable = function(locations, showLocation, defaultLocation) {
    if (!S.currentEndpoint) return document.createElement('div');

    var allParams = S.currentEndpoint.parameters || [];
    var container = document.createElement('div');

    var table = document.createElement('table');
    table.className = 'params-table editable-table' + (showLocation ? '' : ' no-location');

    var thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Name</th><th>Location</th><th>Type</th><th>Required</th><th>Description</th><th></th></tr>';
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    allParams.forEach(function(param, index) {
      if (locations.indexOf(param.in) !== -1) {
        var row = S.createEditableParameterRow(param, index);
        tbody.appendChild(row);
      }
    });
    table.appendChild(tbody);

    container.appendChild(table);

    var addRow = document.createElement('div');
    addRow.className = 'add-param-row';
    var addBtn = document.createElement('button');
    addBtn.className = 'add-param-btn';
    addBtn.textContent = '+ Add Parameter';
    addBtn.addEventListener('click', function() {
      S.showAddParameterDialog(defaultLocation, showLocation);
    });
    addRow.appendChild(addBtn);
    container.appendChild(addRow);

    return container;
  };

  // Render the definition sub-tabs (Params, Body, Headers, Cookies)
  // If onlyParams is true, skip re-rendering the Body tab (avoids unnecessary side effects)
  S.renderDefinitionTabs = function(onlyParams) {
    if (!S.currentEndpoint) return;

    var params = S.currentEndpoint.parameters || [];

    // Count per location
    var paramCount = 0, headerCount = 0, cookieCount = 0;
    params.forEach(function(p) {
      if (p.in === 'query' || p.in === 'path') paramCount++;
      else if (p.in === 'header') headerCount++;
      else if (p.in === 'cookie') cookieCount++;
    });

    // Update tab badges
    var tabBtns = document.querySelectorAll('.definition-tab-btn');
    tabBtns.forEach(function(btn) {
      var tab = btn.dataset.defTab;
      var label = '';
      if (tab === 'params') label = 'Params' + (paramCount > 0 ? ' (' + paramCount + ')' : '');
      else if (tab === 'body') label = 'Body';
      else if (tab === 'headers') label = 'Headers' + (headerCount > 0 ? ' (' + headerCount + ')' : '');
      else if (tab === 'cookies') label = 'Cookies' + (cookieCount > 0 ? ' (' + cookieCount + ')' : '');
      btn.textContent = label;
    });

    // Render Params tab
    var paramsTab = document.getElementById('def-params-tab');
    paramsTab.innerHTML = '';
    paramsTab.appendChild(S.createFilteredParameterTable(['query', 'path'], true, 'query'));

    // Render Body tab (skip if only updating params)
    if (!onlyParams) {
      var bodyTab = document.getElementById('def-body-tab');
      bodyTab.innerHTML = '';
      S.renderBodyTab(bodyTab);
    }

    // Render Headers tab
    var headersTab = document.getElementById('def-headers-tab');
    headersTab.innerHTML = '';
    headersTab.appendChild(S.createFilteredParameterTable(['header'], false, 'header'));

    // Render Cookies tab
    var cookiesTab = document.getElementById('def-cookies-tab');
    cookiesTab.innerHTML = '';
    cookiesTab.appendChild(S.createFilteredParameterTable(['cookie'], false, 'cookie'));
  };

  S.switchDefinitionTab = function(tabName) {
    document.querySelectorAll('.definition-tab-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.defTab === tabName);
    });
    document.querySelectorAll('.definition-tab-content').forEach(function(content) {
      content.classList.toggle('active', content.id === 'def-' + tabName + '-tab');
    });
    S._activeDefTab = tabName;
  };

  // ---- Body tab implementation ----

  var BODY_TYPE_MAP = {
    'none': null,
    'form-data': 'multipart/form-data',
    'json': 'application/json',
    'raw': 'text/plain',
    'x-www-form-urlencoded': 'application/x-www-form-urlencoded'
  };

  var CONTENT_TYPE_TO_BODY_TYPE = {};
  Object.keys(BODY_TYPE_MAP).forEach(function(k) {
    if (BODY_TYPE_MAP[k]) CONTENT_TYPE_TO_BODY_TYPE[BODY_TYPE_MAP[k]] = k;
  });

  S._currentBodyType = 'none';

  function detectBodyType(endpoint) {
    if (!endpoint.requestBody || !endpoint.requestBody.content) return 'none';
    var keys = Object.keys(endpoint.requestBody.content);
    if (keys.length === 0) return 'none';
    var ct = keys[0];
    return CONTENT_TYPE_TO_BODY_TYPE[ct] || 'json';
  }

  S.renderBodyTab = function(container) {
    var endpoint = S.currentEndpoint;
    S._currentBodyType = detectBodyType(endpoint);

    // Top row with type selector and save button
    var topRow = document.createElement('div');
    topRow.className = 'body-tab-header';

    // Type selector
    var selector = document.createElement('div');
    selector.className = 'body-type-selector';
    var types = ['none', 'form-data', 'json', 'raw', 'x-www-form-urlencoded'];
    types.forEach(function(type) {
      var btn = document.createElement('button');
      btn.className = 'body-type-btn' + (type === S._currentBodyType ? ' active' : '');
      btn.textContent = type;
      btn.addEventListener('click', function() {
        S._currentBodyType = type;
        selector.querySelectorAll('.body-type-btn').forEach(function(b) {
          b.classList.toggle('active', b.textContent === type);
        });
        // Don't auto-save when switching tabs - user must click Save button
        S._renderBodyContent(editorArea, type, false);
      });
      selector.appendChild(btn);
    });
    topRow.appendChild(selector);

    // Save button in the header row
    var saveBtn = document.createElement('button');
    saveBtn.className = 'body-header-save-btn';
    saveBtn.textContent = 'Save';
    saveBtn.id = 'body-tab-save-btn';
    topRow.appendChild(saveBtn);

    container.appendChild(topRow);

    // Editor area
    var editorArea = document.createElement('div');
    editorArea.className = 'body-editor-content';
    container.appendChild(editorArea);

    S._renderBodyContent(editorArea, S._currentBodyType);
  };

  S._renderBodyContent = function(container, type, save) {
    container.innerHTML = '';
    var endpoint = S.currentEndpoint;

    // Get the header save button
    var headerSaveBtn = document.getElementById('body-tab-save-btn');

    if (type === 'none') {
      var noContentDiv = document.createElement('div');
      noContentDiv.className = 'no-content';
      noContentDiv.textContent = 'This request does not have a body';
      container.appendChild(noContentDiv);

      // Set up header save button for 'none' type
      if (headerSaveBtn) {
        var newBtn = headerSaveBtn.cloneNode(true);
        newBtn.id = 'body-tab-save-btn';
        headerSaveBtn.parentNode.replaceChild(newBtn, headerSaveBtn);
        newBtn.addEventListener('click', function() {
          S._saveRequestBody(null);
        });
      }
      return;
    }

    var contentType = BODY_TYPE_MAP[type];
    var existingMedia = null;

    // Try to get the media for the selected content type
    if (endpoint.requestBody && endpoint.requestBody.content) {
      // First, try exact match
      existingMedia = endpoint.requestBody.content[contentType];

      // If not found, try to find a matching content type (handles cases like 'application/json; charset=utf-8')
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
        var detectedType = detectBodyType(endpoint);
        if (type === detectedType) {
          var keys = Object.keys(endpoint.requestBody.content);
          if (keys.length > 0) {
            existingMedia = endpoint.requestBody.content[keys[0]];
          }
        }
      }
    }

    if (type === 'json') {
      S._renderJsonBodyEditor(container, existingMedia);
    } else if (type === 'raw') {
      S._renderRawBodyEditor(container, existingMedia);
    } else if (type === 'form-data') {
      S._renderKvBodyEditor(container, existingMedia, true);
    } else if (type === 'x-www-form-urlencoded') {
      S._renderKvBodyEditor(container, existingMedia, false);
    }
  };

  S._saveRequestBody = function(requestBody) {
    if (!S.currentEndpoint) {
      console.error('[_saveRequestBody] No currentEndpoint');
      return;
    }
    console.log('[_saveRequestBody] Saving:', {
      filePath: S.currentEndpoint.filePath,
      path: S.currentEndpoint.path,
      method: S.currentEndpoint.method,
      requestBody: requestBody
    });
    S.currentEndpoint.requestBody = requestBody;
    S.vscode.postMessage({
      type: 'updateRequestBody',
      payload: {
        filePath: S.currentEndpoint.filePath,
        path: S.currentEndpoint.path,
        method: S.currentEndpoint.method,
        requestBody: requestBody
      }
    });
  };

  S._buildKvRequestBody = function(contentType, rows) {
    var properties = {};
    var required = [];
    rows.forEach(function(r) {
      if (!r.name) return;
      var prop = { type: r.type || 'string' };
      if (r.description) prop.description = r.description;
      if (r.format) prop.format = r.format;
      properties[r.name] = prop;
      if (r.required) required.push(r.name);
    });
    var schema = { type: 'object', properties: properties };
    if (required.length > 0) schema.required = required;
    var content = {};
    content[contentType] = { schema: schema };
    return { content: content };
  };

  // JSON body editor - GUI table for schema properties with tree view support
  S._renderJsonBodyEditor = function(container, existingMedia) {
    var schema = existingMedia && existingMedia.schema ? existingMedia.schema : {};
    var contentType = 'application/json';

    // Get the header save button reference first
    var headerSaveBtn = document.getElementById('body-tab-save-btn');
    var newBtn = null;

    // Use the reusable SchemaTable component
    var schemaTable = window.SchemaTable.create({
      container: container,
      schema: schema,
      onDirtyChange: function(isDirty) {
        if (newBtn) {
          newBtn.style.display = isDirty ? '' : 'none';
        }
      },
      onShowOthersDialog: function(propName, propDef, onSave) {
        S._showBodyPropertyDetailDialog(propName, propDef, onSave);
      }
    });

    // Store reference for later use
    container._schemaTable = schemaTable;

    // Set up header save button for JSON type
    if (headerSaveBtn) {
      newBtn = headerSaveBtn.cloneNode(true);
      newBtn.id = 'body-tab-save-btn';
      newBtn.style.display = 'none'; // Hidden until changes are made
      headerSaveBtn.parentNode.replaceChild(newBtn, headerSaveBtn);
      newBtn.addEventListener('click', function() {
        var schemaObj = schemaTable.getSchema();
        var content = {};
        content[contentType] = { schema: schemaObj };
        S._saveRequestBody({ content: content });
        schemaTable.setClean();
      });
    }
  };

  // Sort order for all "others" fields
  var BODY_FIELD_SORT_ORDER = {
    'format': 1, 'example': 2, 'default': 3,
    'enum': 10,
    'pattern': 20, 'minLength': 21, 'maxLength': 22,
    'minimum': 30, 'maximum': 31, 'exclusiveMinimum': 32, 'exclusiveMaximum': 33,
    'minItems': 40, 'maxItems': 41, 'uniqueItems': 42,
    'nullable': 50, 'deprecated': 51, 'readOnly': 52, 'writeOnly': 53
  };

  var BODY_SECTION_ORDER = {
    'General': 0, 'Enum': 1, 'String Constraints': 2,
    'Number Constraints': 3, 'Array Constraints': 4, 'Flags': 5
  };

  var BODY_FIELD_TO_SECTION = {
    'format': 'General', 'example': 'General', 'default': 'General',
    'enum': 'Enum',
    'pattern': 'String Constraints', 'minLength': 'String Constraints', 'maxLength': 'String Constraints',
    'minimum': 'Number Constraints', 'maximum': 'Number Constraints', 'exclusiveMinimum': 'Number Constraints', 'exclusiveMaximum': 'Number Constraints',
    'minItems': 'Array Constraints', 'maxItems': 'Array Constraints', 'uniqueItems': 'Array Constraints',
    'nullable': 'Flags', 'deprecated': 'Flags', 'readOnly': 'Flags', 'writeOnly': 'Flags'
  };

  // Dialog for editing property details (Others fields) - matches Schema Edit Property dialog
  S._showBodyPropertyDetailDialog = function(propName, propDef, onSave) {
    var existingDialog = document.querySelector('.server-dialog-overlay');
    if (existingDialog) existingDialog.remove();

    var overlay = document.createElement('div');
    overlay.className = 'server-dialog-overlay';

    var dialog = document.createElement('div');
    dialog.className = 'server-dialog property-detail-dialog';

    var title = document.createElement('h3');
    title.textContent = 'Edit Property: ' + propName;

    var inputs = {};
    var deletedFields = {};
    var sectionRows = {};

    var table = document.createElement('table');
    table.className = 'detail-table';

    var thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Field</th><th>Value</th><th></th></tr>';
    table.appendChild(thead);

    var tbody = document.createElement('tbody');

    // Helper: find the correct insertion point for a row based on sort order
    var findInsertionPoint = function(fieldKey) {
      var sortId = BODY_FIELD_SORT_ORDER[fieldKey] || 999;
      var rows = tbody.querySelectorAll('tr[data-field-key]');
      for (var i = 0; i < rows.length; i++) {
        var existingKey = rows[i].getAttribute('data-field-key');
        var existingSortId = BODY_FIELD_SORT_ORDER[existingKey] || 999;
        if (existingSortId > sortId) {
          var prev = rows[i].previousElementSibling;
          if (prev && prev.classList.contains('detail-section-row')) {
            var fieldSection = BODY_FIELD_TO_SECTION[fieldKey];
            var existingSection = BODY_FIELD_TO_SECTION[existingKey];
            if (fieldSection !== existingSection) {
              return prev;
            }
          }
          return rows[i];
        }
      }
      return null;
    };

    var findSectionInsertionPoint = function(sectionLabel) {
      var sectionOrder = BODY_SECTION_ORDER[sectionLabel] !== undefined ? BODY_SECTION_ORDER[sectionLabel] : 999;
      var rows = tbody.children;
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (row.classList.contains('detail-section-row')) {
          var text = row.textContent;
          var existingOrder = BODY_SECTION_ORDER[text] !== undefined ? BODY_SECTION_ORDER[text] : 999;
          if (existingOrder > sectionOrder) return row;
        } else if (row.hasAttribute('data-field-key')) {
          var key = row.getAttribute('data-field-key');
          var fieldSection = BODY_FIELD_TO_SECTION[key];
          var fieldSectionOrder = BODY_SECTION_ORDER[fieldSection] !== undefined ? BODY_SECTION_ORDER[fieldSection] : 999;
          if (fieldSectionOrder > sectionOrder) return row;
        }
      }
      return null;
    };

    var cleanupEmptySections = function() {
      for (var sectionLabel in sectionRows) {
        var sectionTr = sectionRows[sectionLabel];
        if (!sectionTr.parentNode) {
          delete sectionRows[sectionLabel];
          continue;
        }
        var hasFields = false;
        var sibling = sectionTr.nextElementSibling;
        while (sibling) {
          if (sibling.classList.contains('detail-section-row')) break;
          if (sibling.hasAttribute('data-field-key')) {
            hasFields = true;
            break;
          }
          sibling = sibling.nextElementSibling;
        }
        if (!hasFields) {
          sectionTr.parentNode.removeChild(sectionTr);
          delete sectionRows[sectionLabel];
        }
      }
    };

    var addSectionRow = function(label) {
      var tr = document.createElement('tr');
      tr.className = 'detail-section-row';
      var td = document.createElement('td');
      td.colSpan = 3;
      td.textContent = label;
      tr.appendChild(td);
      var ref = findSectionInsertionPoint(label);
      if (ref) {
        tbody.insertBefore(tr, ref);
      } else {
        tbody.appendChild(tr);
      }
      sectionRows[label] = tr;
    };

    var addFieldRow = function(key, label, inputType, value, placeholder) {
      var tr = document.createElement('tr');
      tr.setAttribute('data-field-key', key);
      var tdLabel = document.createElement('td');
      tdLabel.className = 'detail-field-label';
      tdLabel.textContent = label;

      var tdValue = document.createElement('td');
      tdValue.className = 'detail-field-value';

      var input;
      if (inputType === 'textarea') {
        input = document.createElement('textarea');
        input.className = 'server-input';
        input.rows = 2;
      } else if (inputType === 'select') {
        input = document.createElement('select');
        input.className = 'server-input';
      } else {
        input = document.createElement('input');
        input.type = inputType;
        input.className = 'server-input';
      }
      if (placeholder) input.placeholder = placeholder;
      if (inputType !== 'select') input.value = value !== undefined && value !== null ? String(value) : '';

      tdValue.appendChild(input);

      var tdDelete = document.createElement('td');
      tdDelete.className = 'detail-field-delete';
      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'detail-field-delete-btn';
      deleteBtn.textContent = '✕';
      deleteBtn.title = 'Remove field';
      (function(fieldKey, row) {
        deleteBtn.addEventListener('click', function() {
          row.parentNode.removeChild(row);
          delete inputs[fieldKey];
          deletedFields[fieldKey] = true;
          cleanupEmptySections();
          updateAddFieldBtn();
        });
      })(key, tr);
      tdDelete.appendChild(deleteBtn);

      tr.appendChild(tdLabel);
      tr.appendChild(tdValue);
      tr.appendChild(tdDelete);
      var ref = findInsertionPoint(key);
      if (ref) {
        tbody.insertBefore(tr, ref);
      } else {
        tbody.appendChild(tr);
      }
      inputs[key] = input;
      return input;
    };

    var addCheckboxRow = function(key, label, checked) {
      var tr = document.createElement('tr');
      tr.setAttribute('data-field-key', key);
      var tdLabel = document.createElement('td');
      tdLabel.className = 'detail-field-label';
      tdLabel.textContent = label;

      var tdValue = document.createElement('td');
      tdValue.className = 'detail-field-value';

      var switchLabel = document.createElement('label');
      switchLabel.className = 'switch-toggle';

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!checked;

      var slider = document.createElement('span');
      slider.className = 'switch-slider';

      switchLabel.appendChild(cb);
      switchLabel.appendChild(slider);
      tdValue.appendChild(switchLabel);

      var tdDelete = document.createElement('td');
      tdDelete.className = 'detail-field-delete';
      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'detail-field-delete-btn';
      deleteBtn.textContent = '✕';
      deleteBtn.title = 'Remove field';
      (function(fieldKey, row) {
        deleteBtn.addEventListener('click', function() {
          row.parentNode.removeChild(row);
          delete inputs[fieldKey];
          deletedFields[fieldKey] = true;
          cleanupEmptySections();
          updateAddFieldBtn();
        });
      })(key, tr);
      tdDelete.appendChild(deleteBtn);

      tr.appendChild(tdLabel);
      tr.appendChild(tdValue);
      tr.appendChild(tdDelete);
      var ref = findInsertionPoint(key);
      if (ref) {
        tbody.insertBefore(tr, ref);
      } else {
        tbody.appendChild(tr);
      }
      inputs[key] = cb;
      return cb;
    };

    // Determine which fields exist
    var hasFormat = propDef.format !== undefined;
    var hasExample = propDef.example !== undefined;
    var hasDefault = propDef.default !== undefined;
    var hasEnum = propDef.enum !== undefined && propDef.enum.length > 0;
    var hasPattern = propDef.pattern !== undefined;
    var hasMinLen = propDef.minLength !== undefined;
    var hasMaxLen = propDef.maxLength !== undefined;
    var hasMin = propDef.minimum !== undefined;
    var hasMax = propDef.maximum !== undefined;
    var hasExclMin = propDef.exclusiveMinimum !== undefined;
    var hasExclMax = propDef.exclusiveMaximum !== undefined;
    var hasMinItems = propDef.minItems !== undefined;
    var hasMaxItems = propDef.maxItems !== undefined;
    var hasUniqueItems = propDef.uniqueItems !== undefined;
    var hasNullable = propDef.nullable !== undefined;
    var hasDeprecated = propDef.deprecated !== undefined;
    var hasReadOnly = propDef.readOnly !== undefined;
    var hasWriteOnly = propDef.writeOnly !== undefined;

    var hasGeneral = hasFormat || hasExample || hasDefault;
    var hasEnumSection = hasEnum;
    var hasStrConstraints = hasPattern || hasMinLen || hasMaxLen;
    var hasNumConstraints = hasMin || hasMax || hasExclMin || hasExclMax;
    var hasArrConstraints = hasMinItems || hasMaxItems || hasUniqueItems;
    var hasFlags = hasNullable || hasDeprecated || hasReadOnly || hasWriteOnly;

    if (hasGeneral) {
      addSectionRow('General');
      if (hasFormat) {
        var formatSel = addFieldRow('format', 'format', 'select', '', '');
        var formatOptions = { string: ['', 'date', 'date-time', 'email', 'uri', 'uuid', 'hostname', 'ipv4', 'ipv6', 'byte', 'binary', 'password'], integer: ['', 'int32', 'int64'], number: ['', 'float', 'double'] };
        var currentType = propDef.type || 'string';
        var opts = formatOptions[currentType] || [''];
        if (propDef.format && opts.indexOf(propDef.format) === -1) opts = opts.concat([propDef.format]);
        opts.forEach(function(f) {
          var opt = document.createElement('option');
          opt.value = f;
          opt.textContent = f || '(none)';
          if (f === (propDef.format || '')) opt.selected = true;
          formatSel.appendChild(opt);
        });
      }
      if (hasExample) addFieldRow('example', 'example', 'text', typeof propDef.example === 'object' ? JSON.stringify(propDef.example) : String(propDef.example), 'JSON value');
      if (hasDefault) addFieldRow('default', 'default', 'text', typeof propDef.default === 'object' ? JSON.stringify(propDef.default) : String(propDef.default), 'JSON value');
    }

    if (hasEnumSection) {
      addSectionRow('Enum');
      addFieldRow('enum', 'enum', 'textarea', propDef.enum.join(', '), 'comma-separated values');
    }

    if (hasStrConstraints) {
      addSectionRow('String Constraints');
      if (hasPattern) addFieldRow('pattern', 'pattern', 'text', propDef.pattern, '^[a-zA-Z]+$');
      if (hasMinLen) addFieldRow('minLength', 'minLength', 'number', propDef.minLength, '');
      if (hasMaxLen) addFieldRow('maxLength', 'maxLength', 'number', propDef.maxLength, '');
    }

    if (hasNumConstraints) {
      addSectionRow('Number Constraints');
      if (hasMin) addFieldRow('minimum', 'minimum', 'number', propDef.minimum, '');
      if (hasMax) addFieldRow('maximum', 'maximum', 'number', propDef.maximum, '');
      if (hasExclMin) addFieldRow('exclusiveMinimum', 'exclusiveMinimum', 'number', typeof propDef.exclusiveMinimum === 'number' ? propDef.exclusiveMinimum : '', '');
      if (hasExclMax) addFieldRow('exclusiveMaximum', 'exclusiveMaximum', 'number', typeof propDef.exclusiveMaximum === 'number' ? propDef.exclusiveMaximum : '', '');
    }

    if (hasArrConstraints) {
      addSectionRow('Array Constraints');
      if (hasMinItems) addFieldRow('minItems', 'minItems', 'number', propDef.minItems, '');
      if (hasMaxItems) addFieldRow('maxItems', 'maxItems', 'number', propDef.maxItems, '');
      if (hasUniqueItems) addCheckboxRow('uniqueItems', 'uniqueItems', propDef.uniqueItems);
    }

    if (hasFlags) {
      addSectionRow('Flags');
      if (hasNullable) addCheckboxRow('nullable', 'nullable', propDef.nullable);
      if (hasDeprecated) addCheckboxRow('deprecated', 'deprecated', propDef.deprecated);
      if (hasReadOnly) addCheckboxRow('readOnly', 'readOnly', propDef.readOnly);
      if (hasWriteOnly) addCheckboxRow('writeOnly', 'writeOnly', propDef.writeOnly);
    }

    table.appendChild(tbody);

    // --- Add Field feature ---
    var allFields = {
      'General': [
        { key: 'format', label: 'format', inputType: 'select', placeholder: '' },
        { key: 'example', label: 'example', inputType: 'text', placeholder: 'JSON value' },
        { key: 'default', label: 'default', inputType: 'text', placeholder: 'JSON value' }
      ],
      'Enum': [
        { key: 'enum', label: 'enum', inputType: 'textarea', placeholder: 'comma-separated values' }
      ],
      'String Constraints': [
        { key: 'pattern', label: 'pattern', inputType: 'text', placeholder: '^[a-zA-Z]+$' },
        { key: 'minLength', label: 'minLength', inputType: 'number', placeholder: '' },
        { key: 'maxLength', label: 'maxLength', inputType: 'number', placeholder: '' }
      ],
      'Number Constraints': [
        { key: 'minimum', label: 'minimum', inputType: 'number', placeholder: '' },
        { key: 'maximum', label: 'maximum', inputType: 'number', placeholder: '' },
        { key: 'exclusiveMinimum', label: 'exclusiveMinimum', inputType: 'number', placeholder: '' },
        { key: 'exclusiveMaximum', label: 'exclusiveMaximum', inputType: 'number', placeholder: '' }
      ],
      'Array Constraints': [
        { key: 'minItems', label: 'minItems', inputType: 'number', placeholder: '' },
        { key: 'maxItems', label: 'maxItems', inputType: 'number', placeholder: '' },
        { key: 'uniqueItems', label: 'uniqueItems', inputType: 'checkbox', placeholder: '' }
      ],
      'Flags': [
        { key: 'nullable', label: 'nullable', inputType: 'checkbox', placeholder: '' },
        { key: 'deprecated', label: 'deprecated', inputType: 'checkbox', placeholder: '' },
        { key: 'readOnly', label: 'readOnly', inputType: 'checkbox', placeholder: '' },
        { key: 'writeOnly', label: 'writeOnly', inputType: 'checkbox', placeholder: '' }
      ]
    };

    var getAvailableFields = function() {
      var available = [];
      for (var section in allFields) {
        var fields = allFields[section];
        for (var i = 0; i < fields.length; i++) {
          if (!inputs[fields[i].key]) {
            available.push({ section: section, field: fields[i] });
          }
        }
      }
      return available;
    };

    var addFieldContainer = document.createElement('div');
    addFieldContainer.className = 'add-field-container';

    var addFieldBtn = document.createElement('button');
    addFieldBtn.className = 'add-field-btn';
    addFieldBtn.textContent = '+ Add Field';

    var addFieldDropdown = document.createElement('div');
    addFieldDropdown.className = 'add-field-dropdown';
    addFieldDropdown.style.display = 'none';

    var updateAddFieldBtn = function() {
      var available = getAvailableFields();
      if (available.length === 0) {
        addFieldBtn.style.display = 'none';
      } else {
        addFieldBtn.style.display = '';
      }
    };

    var renderDropdown = function() {
      addFieldDropdown.innerHTML = '';
      var available = getAvailableFields();
      var currentSection = '';

      for (var i = 0; i < available.length; i++) {
        (function(item) {
          if (item.section !== currentSection) {
            currentSection = item.section;
            var sectionHeader = document.createElement('div');
            sectionHeader.className = 'add-field-dropdown-section';
            sectionHeader.textContent = item.section;
            addFieldDropdown.appendChild(sectionHeader);
          }

          var option = document.createElement('div');
          option.className = 'add-field-dropdown-item';
          option.textContent = item.field.label;
          option.addEventListener('click', function() {
            if (!sectionRows[item.section]) {
              addSectionRow(item.section);
            }

            if (item.field.inputType === 'checkbox') {
              addCheckboxRow(item.field.key, item.field.label, false);
            } else if (item.field.key === 'format') {
              var formatSel = addFieldRow('format', 'format', 'select', '', '');
              var formatOptions = { string: ['', 'date', 'date-time', 'email', 'uri', 'uuid', 'hostname', 'ipv4', 'ipv6', 'byte', 'binary', 'password'], integer: ['', 'int32', 'int64'], number: ['', 'float', 'double'] };
              var currentType = propDef.type || 'string';
              var opts = formatOptions[currentType] || [''];
              opts.forEach(function(f) {
                var opt = document.createElement('option');
                opt.value = f;
                opt.textContent = f || '(none)';
                formatSel.appendChild(opt);
              });
            } else {
              addFieldRow(item.field.key, item.field.label, item.field.inputType, '', item.field.placeholder);
            }

            delete deletedFields[item.field.key];
            addFieldDropdown.style.display = 'none';
            updateAddFieldBtn();

            if (inputs[item.field.key] && inputs[item.field.key].focus) {
              inputs[item.field.key].focus();
            }
          });
          addFieldDropdown.appendChild(option);
        })(available[i]);
      }
    };

    addFieldBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (addFieldDropdown.style.display === 'none') {
        renderDropdown();
        addFieldDropdown.style.top = '';
        addFieldDropdown.style.bottom = '';
        addFieldDropdown.style.marginTop = '';
        addFieldDropdown.style.marginBottom = '';
        addFieldDropdown.style.display = 'block';

        var btnRect = addFieldBtn.getBoundingClientRect();
        var dialogRect = dialog.getBoundingClientRect();
        var dropdownHeight = addFieldDropdown.offsetHeight;
        var spaceBelow = dialogRect.bottom - btnRect.bottom - 16;
        var spaceAbove = btnRect.top - dialogRect.top - 16;

        if (spaceBelow >= dropdownHeight) {
          addFieldDropdown.style.top = '100%';
          addFieldDropdown.style.bottom = 'auto';
          addFieldDropdown.style.marginTop = '4px';
          addFieldDropdown.style.marginBottom = '0';
        } else if (spaceAbove >= dropdownHeight) {
          addFieldDropdown.style.top = 'auto';
          addFieldDropdown.style.bottom = '100%';
          addFieldDropdown.style.marginTop = '0';
          addFieldDropdown.style.marginBottom = '4px';
        } else {
          if (spaceBelow >= spaceAbove) {
            addFieldDropdown.style.top = '100%';
            addFieldDropdown.style.bottom = 'auto';
            addFieldDropdown.style.marginTop = '4px';
            addFieldDropdown.style.marginBottom = '0';
            addFieldDropdown.style.maxHeight = spaceBelow + 'px';
          } else {
            addFieldDropdown.style.top = 'auto';
            addFieldDropdown.style.bottom = '100%';
            addFieldDropdown.style.marginTop = '0';
            addFieldDropdown.style.marginBottom = '4px';
            addFieldDropdown.style.maxHeight = spaceAbove + 'px';
          }
        }
      } else {
        addFieldDropdown.style.display = 'none';
      }
    });

    dialog.addEventListener('click', function(e) {
      if (!addFieldContainer.contains(e.target)) {
        addFieldDropdown.style.display = 'none';
      }
    });

    addFieldContainer.appendChild(addFieldBtn);
    addFieldContainer.appendChild(addFieldDropdown);

    // --- Buttons ---
    var buttons = document.createElement('div');
    buttons.className = 'server-dialog-buttons';

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'server-dialog-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', function() { overlay.remove(); });

    var saveBtn = document.createElement('button');
    saveBtn.className = 'server-dialog-save';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', function() {
      var result = {};

      // Always include type from propDef
      result.type = propDef.type || 'string';

      if (inputs.format) {
        var fv = inputs.format.value.trim();
        if (fv) result.format = fv;
      }
      if (inputs.example) {
        var ev = inputs.example.value.trim();
        if (ev) { try { result.example = JSON.parse(ev); } catch(e) { result.example = ev; } }
      }
      if (inputs.default) {
        var dv = inputs.default.value.trim();
        if (dv) { try { result.default = JSON.parse(dv); } catch(e) { result.default = dv; } }
      }
      if (inputs.enum) {
        var enumVal = inputs.enum.value.trim();
        if (enumVal) { result.enum = enumVal.split(',').map(function(v) { return v.trim(); }).filter(function(v) { return v; }); }
      }
      if (inputs.pattern) { var pv = inputs.pattern.value.trim(); if (pv) result.pattern = pv; }

      var numFields = ['minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minItems', 'maxItems'];
      numFields.forEach(function(f) {
        if (inputs[f]) {
          var v = inputs[f].value.trim();
          if (v !== '') result[f] = Number(v);
        }
      });

      var boolFields = ['uniqueItems', 'nullable', 'deprecated', 'readOnly', 'writeOnly'];
      boolFields.forEach(function(f) {
        if (inputs[f] && inputs[f].checked) { result[f] = true; }
      });

      // Preserve description if it exists
      if (propDef.description) result.description = propDef.description;

      onSave(result);
      overlay.remove();
    });

    buttons.appendChild(cancelBtn);
    buttons.appendChild(saveBtn);

    dialog.appendChild(title);
    dialog.appendChild(table);
    dialog.appendChild(addFieldContainer);
    updateAddFieldBtn();
    dialog.appendChild(buttons);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    overlay.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') overlay.remove();
    });
  };

  // Raw text body editor
  S._renderRawBodyEditor = function(container, existingMedia) {
    var textarea = document.createElement('textarea');
    textarea.className = 'body-editor-area';
    textarea.placeholder = 'Enter raw body content...';
    // For raw, we store example in the media object
    if (existingMedia && existingMedia.example) {
      textarea.value = typeof existingMedia.example === 'string' ? existingMedia.example : JSON.stringify(existingMedia.example);
    }
    container.appendChild(textarea);

    // Set up header save button for raw type
    var headerSaveBtn = document.getElementById('body-tab-save-btn');
    if (headerSaveBtn) {
      var newBtn = headerSaveBtn.cloneNode(true);
      newBtn.id = 'body-tab-save-btn';
      headerSaveBtn.parentNode.replaceChild(newBtn, headerSaveBtn);
      newBtn.addEventListener('click', function() {
        var content = {};
        content['text/plain'] = {};
        if (textarea.value.trim()) {
          content['text/plain'].example = textarea.value;
        }
        S._saveRequestBody({ content: content });
      });
    }
  };

  // Key-value body editor (form-data / x-www-form-urlencoded)
  S._renderKvBodyEditor = function(container, existingMedia, isFormData) {
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
          required: requiredList.indexOf(name) !== -1
        });
      });
    }

    var table = document.createElement('table');
    table.className = 'body-kv-table';

    var thead = document.createElement('thead');
    var headerHtml = '<tr><th>Name</th>';
    if (isFormData) headerHtml += '<th>Type</th>';
    headerHtml += '<th>Required</th><th>Description</th><th></th></tr>';
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
      tdName.appendChild(nameInput);
      tr.appendChild(tdName);

      // Type (form-data only)
      var typeSelect;
      if (isFormData) {
        var tdType = document.createElement('td');
        typeSelect = document.createElement('select');
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

      // Required
      var tdReq = document.createElement('td');
      var reqCheckbox = document.createElement('input');
      reqCheckbox.type = 'checkbox';
      reqCheckbox.checked = data.required || false;
      tdReq.appendChild(reqCheckbox);
      tr.appendChild(tdReq);

      // Description
      var tdDesc = document.createElement('td');
      var descInput = document.createElement('input');
      descInput.type = 'text';
      descInput.value = data.description || '';
      descInput.placeholder = 'description';
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
      addKvRow({ name: '', type: 'string', description: '', required: false });
    });
    addRow.appendChild(addBtn);
    container.appendChild(addRow);

    // Set up header save button for form types
    var headerSaveBtn = document.getElementById('body-tab-save-btn');
    if (headerSaveBtn) {
      var newBtn = headerSaveBtn.cloneNode(true);
      newBtn.id = 'body-tab-save-btn';
      headerSaveBtn.parentNode.replaceChild(newBtn, headerSaveBtn);
      newBtn.addEventListener('click', function() {
        var kvRows = [];
        tbody.querySelectorAll('tr').forEach(function(tr) {
          var inputs = tr.querySelectorAll('input');
          var selects = tr.querySelectorAll('select');
          var name = inputs[0].value.trim();
          if (!name) return;
          var type = isFormData ? selects[0].value : 'string';
          var required = isFormData ? inputs[1].checked : inputs[1].checked;
          var description = isFormData ? inputs[2].value.trim() : inputs[2].value.trim();
          var format = (type === 'file') ? 'binary' : undefined;
          kvRows.push({ name: name, type: type === 'file' ? 'string' : type, description: description, required: required, format: format });
        });
        S._saveRequestBody(S._buildKvRequestBody(contentType, kvRows));
      });
    }
  };

  S.saveParameter = function(paramIndex, field, value) {
    if (!S.currentEndpoint || !S.currentEndpoint.parameters[paramIndex]) return;

    const param = S.currentEndpoint.parameters[paramIndex];

    S.vscode.postMessage({
      type: 'updateParameter',
      payload: {
        filePath: S.currentEndpoint.filePath,
        path: S.currentEndpoint.path,
        method: S.currentEndpoint.method,
        paramName: param.name,
        paramIn: param.in,
        field,
        value
      }
    });

    if (field === 'type') {
      if (!param.schema) param.schema = {};
      param.schema.type = value;
    } else if (field === 'required') {
      param.required = value;
    } else if (field === 'description') {
      param.description = value || undefined;
    } else if (field === 'name') {
      param.name = value;
    } else if (field === 'in') {
      param.in = value;
    }

    // Update query params preview if relevant field changed
    if (field === 'name' || field === 'in' || field === 'type') {
      S.updateQueryParamsPreview(S.currentEndpoint);
    }
  };

  S.deleteParameter = function(paramIndex, paramName, paramIn) {
    console.log('deleteParameter called:', paramIndex, paramName, paramIn);
    if (!S.currentEndpoint) {
      console.log('No currentEndpoint, returning');
      return;
    }

    console.log('Sending deleteParameter message to extension');
    S.vscode.postMessage({
      type: 'deleteParameter',
      payload: {
        filePath: S.currentEndpoint.filePath,
        path: S.currentEndpoint.path,
        method: S.currentEndpoint.method,
        paramName,
        paramIn
      }
    });

    S.currentEndpoint.parameters.splice(paramIndex, 1);

    S.renderDefinitionTabs(true);

    // Update query params preview after deletion
    S.updateQueryParamsPreview(S.currentEndpoint);
  };

  S.showAddParameterDialog = function(defaultLocation, showLocation) {
    if (defaultLocation === undefined) defaultLocation = 'query';
    if (showLocation === undefined) showLocation = true;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';

    const locationField = showLocation
      ? `<div class="modal-field">
          <label>Location</label>
          <select id="new-param-in">
            <option value="query"${defaultLocation === 'query' ? ' selected' : ''}>query</option>
            <option value="path"${defaultLocation === 'path' ? ' selected' : ''}>path</option>
            <option value="header"${defaultLocation === 'header' ? ' selected' : ''}>header</option>
            <option value="cookie"${defaultLocation === 'cookie' ? ' selected' : ''}>cookie</option>
          </select>
        </div>`
      : '';

    modal.innerHTML = `
      <div class="modal-dialog">
        <h4>Add Parameter</h4>
        <div class="modal-field">
          <label>Name</label>
          <input type="text" id="new-param-name" placeholder="parameterName">
        </div>
        ${locationField}
        <div class="modal-field">
          <label>Type</label>
          <select id="new-param-type">
            <option value="string">string</option>
            <option value="integer">integer</option>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
            <option value="array">array</option>
            <option value="object">object</option>
          </select>
        </div>
        <div class="modal-field">
          <label>Required</label>
          <input type="checkbox" id="new-param-required">
        </div>
        <div class="modal-field">
          <label>Description</label>
          <input type="text" id="new-param-description" placeholder="Parameter description">
        </div>
        <div class="modal-actions">
          <button class="secondary-btn" id="cancel-add-param">Cancel</button>
          <button class="primary-btn" id="confirm-add-param">Add</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('new-param-name').focus();

    document.getElementById('cancel-add-param').addEventListener('click', () => {
      modal.remove();
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    document.getElementById('confirm-add-param').addEventListener('click', () => {
      const name = document.getElementById('new-param-name').value.trim();
      const paramInEl = document.getElementById('new-param-in');
      const paramIn = paramInEl ? paramInEl.value : defaultLocation;
      const type = document.getElementById('new-param-type').value;
      const required = document.getElementById('new-param-required').checked;
      const description = document.getElementById('new-param-description').value.trim();

      if (!name) {
        alert('Parameter name is required');
        return;
      }

      const exists = S.currentEndpoint.parameters?.some(p => p.name === name && p.in === paramIn);
      if (exists) {
        alert(`Parameter "${name}" (${paramIn}) already exists`);
        return;
      }

      S.addParameter({ name, in: paramIn, type, required, description });
      modal.remove();
    });
  };

  S.addParameter = function(param) {
    if (!S.currentEndpoint) return;

    S.vscode.postMessage({
      type: 'addParameter',
      payload: {
        filePath: S.currentEndpoint.filePath,
        path: S.currentEndpoint.path,
        method: S.currentEndpoint.method,
        parameter: param
      }
    });

    if (!S.currentEndpoint.parameters) {
      S.currentEndpoint.parameters = [];
    }
    S.currentEndpoint.parameters.push({
      name: param.name,
      in: param.in,
      required: param.required,
      description: param.description || undefined,
      schema: { type: param.type }
    });

    S.renderDefinitionTabs(true);

    // Update query params preview after adding parameter
    S.updateQueryParamsPreview(S.currentEndpoint);
  };

  S.showEndpoint = function(endpoint, servers, components) {
    S.currentEndpoint = endpoint;
    S.currentServers = servers || [];
    S.currentComponents = components || null;

    const componentsTabBtn = document.getElementById('components-tab-btn');
    if (componentsTabBtn) {
      if (S.currentComponents && Object.keys(S.currentComponents).length > 0) {
        componentsTabBtn.style.display = '';
      } else {
        componentsTabBtn.style.display = 'none';
        if (componentsTabBtn.classList.contains('active')) {
          S.switchMainTab('details');
        }
      }
    }

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

    const componentsContent = document.getElementById('components-content');
    if (componentsContent) {
      componentsContent.innerHTML = '';
    }

    const serversContent = document.getElementById('servers-content');
    if (serversContent) {
      serversContent.innerHTML = '';
    }

    S.switchMainTab('details');

    // Setup editable method badge
    const methodBadge = document.getElementById('method-badge');
    const newMethodBadge = methodBadge.cloneNode(false);
    newMethodBadge.textContent = endpoint.method.toUpperCase();
    newMethodBadge.className = 'method-badge ' + endpoint.method + ' editable';
    newMethodBadge.title = 'Click to change HTTP method';
    methodBadge.parentNode.replaceChild(newMethodBadge, methodBadge);

    newMethodBadge.addEventListener('click', () => {
      if (newMethodBadge.classList.contains('editing')) return;

      newMethodBadge.classList.add('editing');
      const currentMethod = S.currentEndpoint.method;

      const select = document.createElement('select');
      select.className = 'method-edit-select';
      const methods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
      methods.forEach(m => {
        const option = document.createElement('option');
        option.value = m;
        option.textContent = m.toUpperCase();
        if (m === currentMethod.toLowerCase()) option.selected = true;
        select.appendChild(option);
      });

      newMethodBadge.textContent = '';
      newMethodBadge.appendChild(select);
      select.focus();

      const finishEdit = () => {
        const newMethod = select.value;
        newMethodBadge.classList.remove('editing');
        newMethodBadge.textContent = newMethod.toUpperCase();
        newMethodBadge.className = 'method-badge ' + newMethod + ' editable';

        if (newMethod !== currentMethod.toLowerCase()) {
          S.saveMethod(currentMethod, newMethod);
        }
      };

      select.addEventListener('blur', finishEdit);
      select.addEventListener('change', () => {
        select.blur();
      });
      select.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          select.value = currentMethod.toLowerCase();
          select.blur();
        }
      });
    });

    // Show query params preview
    S.updateQueryParamsPreview(endpoint);

    const pathElement = document.getElementById('endpoint-path');
    const newPathElement = pathElement.cloneNode(false);
    newPathElement.textContent = endpoint.path;
    newPathElement.className = 'endpoint-path editable';
    newPathElement.title = 'Click to edit path';
    pathElement.parentNode.replaceChild(newPathElement, pathElement);

    newPathElement.addEventListener('click', () => {
      if (newPathElement.classList.contains('editing')) return;

      newPathElement.classList.add('editing');
      const currentValue = S.currentEndpoint.path;

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'path-edit-input';
      input.value = currentValue;

      newPathElement.textContent = '';
      newPathElement.appendChild(input);
      input.focus();
      input.select();

      const finishEdit = () => {
        const newValue = input.value.trim();
        newPathElement.classList.remove('editing');
        newPathElement.textContent = newValue || currentValue;

        if (newValue && newValue !== currentValue) {
          S.savePath(currentValue, newValue);
        }
      };

      input.addEventListener('blur', finishEdit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        }
        if (e.key === 'Escape') {
          input.value = currentValue;
          input.blur();
        }
      });
    });

    const metadataContent = document.getElementById('metadata-content');
    metadataContent.innerHTML = '';
    metadataContent.appendChild(S.createEditableField('Summary', 'summary', endpoint.summary));
    metadataContent.appendChild(S.createEditableField('Description', 'description', endpoint.description, true));
    metadataContent.appendChild(S.createEditableField('Operation ID', 'operationId', endpoint.operationId));
    metadataContent.appendChild(S.createTagsField('Tags', endpoint.tags || []));
    metadataContent.appendChild(S.createDeprecatedField(endpoint.deprecated));

    if (!endpoint.parameters) {
      endpoint.parameters = [];
    }

    // Setup definition sub-tabs
    S._activeDefTab = 'params';
    document.querySelectorAll('.definition-tab-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.defTab === 'params');
      // Remove old listeners by cloning
      var newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      newBtn.addEventListener('click', function() {
        S.switchDefinitionTab(newBtn.dataset.defTab);
      });
    });
    document.querySelectorAll('.definition-tab-content').forEach(function(content) {
      content.classList.toggle('active', content.id === 'def-params-tab');
    });

    S.renderDefinitionTabs();

    const escapeHtml = S.escapeHtml;
    const renderSchema = S.renderSchema;
    const getStatusClass = S.getStatusClass;

    const responsesSection = document.getElementById('responses-section');
    const responsesContent = document.getElementById('responses-content');
    if (endpoint.responses && endpoint.responses.length) {
      responsesSection.style.display = 'block';
      let responsesHtml = '';
      endpoint.responses.forEach(r => {
        const statusClass = getStatusClass(r.statusCode);
        responsesHtml += `<div class="response-item">
          <h5><span class="status-code ${statusClass}">${r.statusCode}</span> ${escapeHtml(r.description || '')}</h5>`;
        if (r.content) {
          for (const [contentType, media] of Object.entries(r.content)) {
            const componentName = media.schema?.$ref ? `<span class="component-badge">${escapeHtml(media.schema.$ref)}</span>` : '';
            responsesHtml += `<p><strong>${escapeHtml(contentType)}</strong> ${componentName}</p>`;
            if (media.schema) {
              responsesHtml += `<div class="schema-viewer">${renderSchema(media.schema)}</div>`;
            }
          }
        }
        responsesHtml += '</div>';
      });
      responsesContent.innerHTML = responsesHtml;
    } else {
      responsesSection.style.display = 'none';
    }

    S.setupRequestBuilder(endpoint, servers);

    document.getElementById('no-response').classList.remove('hidden');
    document.getElementById('response-status').style.display = 'none';
    document.getElementById('response-tabs').style.display = 'none';
    document.getElementById('response-toolbar').style.display = 'none';
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  };
})();
