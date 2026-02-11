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
        S._renderBodyContent(editorArea, type, true);
      });
      selector.appendChild(btn);
    });
    container.appendChild(selector);

    // Editor area
    var editorArea = document.createElement('div');
    editorArea.className = 'body-editor-content';
    container.appendChild(editorArea);

    S._renderBodyContent(editorArea, S._currentBodyType);
  };

  S._renderBodyContent = function(container, type, save) {
    container.innerHTML = '';
    var endpoint = S.currentEndpoint;

    if (type === 'none') {
      container.innerHTML = '<div class="no-content">This request does not have a body</div>';
      if (save) {
        S._saveRequestBody(null);
      }
      return;
    }

    var contentType = BODY_TYPE_MAP[type];
    var existingMedia = endpoint.requestBody && endpoint.requestBody.content && endpoint.requestBody.content[contentType];

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
    if (!S.currentEndpoint) return;
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

  // JSON body editor
  S._renderJsonBodyEditor = function(container, existingMedia) {
    var schema = existingMedia && existingMedia.schema ? existingMedia.schema : {};
    var escapeHtml = S.escapeHtml;
    var renderSchema = S.renderSchema;

    // Schema viewer (read-only)
    if (schema && Object.keys(schema).length > 0 && !schema.$ref) {
      var viewerLabel = document.createElement('div');
      viewerLabel.style.cssText = 'font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:4px;';
      viewerLabel.textContent = 'Schema Preview';
      container.appendChild(viewerLabel);

      var viewer = document.createElement('div');
      viewer.className = 'schema-viewer';
      viewer.innerHTML = renderSchema(schema);
      container.appendChild(viewer);

      var spacer = document.createElement('div');
      spacer.style.height = '12px';
      container.appendChild(spacer);
    }

    var editorLabel = document.createElement('div');
    editorLabel.style.cssText = 'font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:4px;';
    editorLabel.textContent = 'Schema JSON';
    container.appendChild(editorLabel);

    var textarea = document.createElement('textarea');
    textarea.className = 'body-editor-area';
    textarea.value = JSON.stringify(schema, null, 2);
    textarea.placeholder = '{\n  "type": "object",\n  "properties": {}\n}';
    container.appendChild(textarea);

    var saveBtn = document.createElement('button');
    saveBtn.className = 'body-save-btn';
    saveBtn.textContent = 'Save Schema';
    saveBtn.addEventListener('click', function() {
      try {
        var parsed = JSON.parse(textarea.value);
        var content = {};
        content['application/json'] = { schema: parsed };
        S._saveRequestBody({ content: content });
      } catch (e) {
        alert('Invalid JSON: ' + e.message);
      }
    });
    container.appendChild(saveBtn);
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

    var saveBtn = document.createElement('button');
    saveBtn.className = 'body-save-btn';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', function() {
      var content = {};
      content['text/plain'] = {};
      if (textarea.value.trim()) {
        content['text/plain'].example = textarea.value;
      }
      S._saveRequestBody({ content: content });
    });
    container.appendChild(saveBtn);
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

    // Save button
    var saveBtn = document.createElement('button');
    saveBtn.className = 'body-save-btn';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', function() {
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
    container.appendChild(saveBtn);
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

    const methodBadge = document.getElementById('method-badge');
    methodBadge.textContent = endpoint.method.toUpperCase();
    methodBadge.className = 'method-badge ' + endpoint.method;

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
    document.getElementById('response-search').style.display = 'none';
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  };
})();
