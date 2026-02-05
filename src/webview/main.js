(function() {
  const vscode = acquireVsCodeApi();

  let currentEndpoint = null;
  let currentServers = [];
  let isLoading = false;
  let startTime = null;
  let elapsedInterval = null;

  // DOM Elements
  const methodBadge = document.getElementById('method-badge');
  const endpointPath = document.getElementById('endpoint-path');
  const environmentSelect = document.getElementById('environment-select');
  const metadataContent = document.getElementById('metadata-content');
  const parametersSection = document.getElementById('parameters-section');
  const parametersContent = document.getElementById('parameters-content');
  const requestBodySection = document.getElementById('request-body-section');
  const requestBodyContent = document.getElementById('request-body-content');
  const responsesSection = document.getElementById('responses-section');
  const responsesContent = document.getElementById('responses-content');
  const baseUrlInput = document.getElementById('base-url');
  const pathParamsContainer = document.getElementById('path-params-container');
  const queryParamsTable = document.getElementById('query-params-table').querySelector('tbody');
  const headersTable = document.getElementById('headers-table').querySelector('tbody');
  const contentTypeSelect = document.getElementById('content-type-select');
  const bodyEditor = document.getElementById('body-editor');
  const sendBtn = document.getElementById('send-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const loadingIndicator = document.getElementById('loading-indicator');
  const elapsedTime = document.getElementById('elapsed-time');
  const responseViewer = document.getElementById('response-viewer');
  const statusCode = document.getElementById('status-code');
  const responseTime = document.getElementById('response-time');
  const responseSize = document.getElementById('response-size');
  const responseBody = document.getElementById('response-body').querySelector('code');
  const responseHeadersTable = document.getElementById('response-headers-table').querySelector('tbody');
  const noResponse = document.getElementById('no-response');
  const prettyPrint = document.getElementById('pretty-print');
  const wordWrap = document.getElementById('word-wrap');
  const searchInput = document.getElementById('search-input');

  let lastResponse = null;

  // Initialize
  function init() {
    setupEventListeners();
    setupCollapsibleSections();
    vscode.postMessage({ type: 'ready' });
  }

  function setupEventListeners() {
    sendBtn.addEventListener('click', sendRequest);
    cancelBtn.addEventListener('click', cancelRequest);

    document.getElementById('add-query-param').addEventListener('click', () => addParamRow(queryParamsTable));
    document.getElementById('add-header').addEventListener('click', () => addParamRow(headersTable));
    document.getElementById('generate-body-btn').addEventListener('click', generateBodyFromSchema);

    // Main tab switching (Details/Request)
    document.querySelectorAll('.main-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchMainTab(btn.dataset.mainTab));
    });

    // Response tab switching (Body/Headers)
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    prettyPrint.addEventListener('change', () => updateResponseBody());
    wordWrap.addEventListener('change', () => {
      document.getElementById('response-body').classList.toggle('word-wrap', wordWrap.checked);
    });

    document.getElementById('copy-response-btn').addEventListener('click', copyResponse);
    document.getElementById('copy-curl-btn').addEventListener('click', copyCurl);
    document.getElementById('save-response-btn').addEventListener('click', saveResponse);

    searchInput.addEventListener('input', searchInResponse);
    document.getElementById('search-prev').addEventListener('click', () => navigateSearch(-1));
    document.getElementById('search-next').addEventListener('click', () => navigateSearch(1));

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        sendRequest();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchInput.focus();
      }
    });
  }

  function switchMainTab(tabName) {
    document.querySelectorAll('.main-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mainTab === tabName);
    });
    document.querySelectorAll('.main-tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `${tabName}-tab`);
    });
  }

  function setupCollapsibleSections() {
    document.querySelectorAll('.section-header.collapsible').forEach(header => {
      header.addEventListener('click', () => {
        header.classList.toggle('collapsed');
        header.nextElementSibling.classList.toggle('hidden');
      });
    });
  }

  // Message handling
  window.addEventListener('message', event => {
    const message = event.data;
    switch (message.type) {
      case 'showEndpoint':
        showEndpoint(message.payload.endpoint, message.payload.servers);
        break;
      case 'responseReceived':
        showResponse(message.payload);
        break;
      case 'error':
        showError(message.payload.message, message.payload.details);
        break;
      case 'loading':
        setLoading(message.payload.loading);
        break;
      case 'updateEnvironments':
        updateEnvironments(message.payload.environments, message.payload.activeId);
        break;
      case 'overviewSaved':
        showSaveStatus(message.payload.success, message.payload.message);
        break;
    }
  });

  function showSaveStatus(success, message) {
    // Show a brief notification
    const notification = document.createElement('div');
    notification.className = `save-notification ${success ? 'success' : 'error'}`;
    notification.textContent = success ? 'Saved' : (message || 'Failed to save');
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }, 1500);
  }

  function saveField(field, value) {
    if (!currentEndpoint) return;

    const updates = {};

    if (field === 'tags') {
      // Parse tags from comma-separated string
      const tags = value ? value.split(',').map(t => t.trim()).filter(t => t) : [];
      updates.tags = tags.length > 0 ? tags : undefined;
    } else if (field === 'deprecated') {
      updates.deprecated = value || undefined;
    } else {
      updates[field] = value || undefined;
    }

    vscode.postMessage({
      type: 'updateOverview',
      payload: {
        filePath: currentEndpoint.filePath,
        path: currentEndpoint.path,
        method: currentEndpoint.method,
        updates
      }
    });

    // Update local state
    if (field === 'tags') {
      currentEndpoint.tags = updates.tags;
    } else if (field === 'deprecated') {
      currentEndpoint.deprecated = updates.deprecated;
    } else {
      currentEndpoint[field] = updates[field];
    }
  }

  function savePath(oldPath, newPath) {
    if (!currentEndpoint) return;

    vscode.postMessage({
      type: 'updatePath',
      payload: {
        filePath: currentEndpoint.filePath,
        oldPath: oldPath,
        newPath: newPath,
        method: currentEndpoint.method
      }
    });

    // Update local state
    currentEndpoint.path = newPath;
  }

  function createEditableField(label, field, value, isTextarea = false) {
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

        // Only save if value changed
        const oldValue = field === 'tags'
          ? (currentEndpoint.tags || []).join(', ')
          : (currentEndpoint[field] || '');
        if (newValue !== oldValue) {
          saveField(field, newValue);
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
  }

  function createDeprecatedField(deprecated) {
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
      saveField('deprecated', checkbox.checked);
    });

    valueContainer.appendChild(checkbox);
    valueContainer.appendChild(checkboxLabel);
    row.appendChild(labelSpan);
    row.appendChild(valueContainer);

    return row;
  }

  function createTagsField(label, tags) {
    const row = document.createElement('div');
    row.className = 'meta-row';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'meta-label';
    labelSpan.textContent = label;

    const valueContainer = document.createElement('div');
    valueContainer.className = 'meta-value-container';

    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'tags-container';

    // Current tags array
    let currentTags = [...tags];

    function renderTags() {
      tagsContainer.innerHTML = '';

      // Render existing tags
      currentTags.forEach((tag, index) => {
        const tagEl = document.createElement('span');
        tagEl.className = 'tag-item';
        tagEl.innerHTML = `
          <span class="tag-text">${escapeHtml(tag)}</span>
          <button type="button" class="tag-remove" data-index="${index}">×</button>
        `;
        tagsContainer.appendChild(tagEl);
      });

      // Add input for new tag
      const addTagBtn = document.createElement('button');
      addTagBtn.type = 'button';
      addTagBtn.className = 'add-tag-btn';
      addTagBtn.textContent = '+ Add';
      addTagBtn.addEventListener('click', () => {
        showAddTagInput();
      });
      tagsContainer.appendChild(addTagBtn);

      // Add event listeners for remove buttons
      tagsContainer.querySelectorAll('.tag-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const index = parseInt(btn.dataset.index);
          currentTags.splice(index, 1);
          saveField('tags', currentTags.join(', '));
          if (currentEndpoint) {
            currentEndpoint.tags = currentTags.length > 0 ? [...currentTags] : undefined;
          }
          renderTags();
        });
      });
    }

    function showAddTagInput() {
      // Replace add button with input
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
            saveField('tags', currentTags.join(', '));
            if (currentEndpoint) {
              currentEndpoint.tags = [...currentTags];
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
  }

  function createEditableParametersTable(parameters) {
    const container = document.createElement('div');

    const table = document.createElement('table');
    table.className = 'params-table editable-table';

    // Header
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Name</th><th>Location</th><th>Type</th><th>Required</th><th>Description</th><th></th></tr>';
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    tbody.id = 'params-tbody';
    parameters.forEach((param, index) => {
      const row = createEditableParameterRow(param, index);
      tbody.appendChild(row);
    });
    table.appendChild(tbody);

    container.appendChild(table);

    // Add parameter button
    const addRow = document.createElement('div');
    addRow.className = 'add-param-row';
    const addBtn = document.createElement('button');
    addBtn.className = 'add-param-btn';
    addBtn.textContent = '+ Add Parameter';
    addBtn.addEventListener('click', () => showAddParameterDialog());
    addRow.appendChild(addBtn);
    container.appendChild(addRow);

    return container;
  }

  function createEditableParameterRow(param, index) {
    const row = document.createElement('tr');
    row.dataset.paramIndex = index;
    row.dataset.paramName = param.name;
    row.dataset.paramIn = param.in;

    // Name (editable for new params, but we'll keep it simple - click to edit)
    const nameCell = document.createElement('td');
    const nameSpan = createEditableTableCell(param.name, 'name', index);
    nameSpan.classList.add('param-name');
    nameCell.appendChild(nameSpan);
    row.appendChild(nameCell);

    // Location (editable dropdown)
    const locationCell = document.createElement('td');
    const locationSpan = createEditableTableCell(param.in, 'in', index, ['query', 'path', 'header', 'cookie']);
    locationSpan.classList.add('param-location');
    locationCell.appendChild(locationSpan);
    row.appendChild(locationCell);

    // Type (editable)
    const typeCell = document.createElement('td');
    const typeSpan = createEditableTableCell(param.schema?.type || 'string', 'type', index, [
      'string', 'integer', 'number', 'boolean', 'array', 'object'
    ]);
    typeCell.appendChild(typeSpan);
    row.appendChild(typeCell);

    // Required (editable checkbox)
    const requiredCell = document.createElement('td');
    const requiredCheckbox = document.createElement('input');
    requiredCheckbox.type = 'checkbox';
    requiredCheckbox.checked = param.required || false;
    requiredCheckbox.className = 'param-required-checkbox';
    requiredCheckbox.addEventListener('change', () => {
      saveParameter(index, 'required', requiredCheckbox.checked);
    });
    requiredCell.appendChild(requiredCheckbox);
    row.appendChild(requiredCell);

    // Description (editable)
    const descCell = document.createElement('td');
    const descSpan = createEditableTableCell(param.description || '', 'description', index);
    descCell.appendChild(descSpan);
    row.appendChild(descCell);

    // Delete button
    const actionsCell = document.createElement('td');
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'param-delete-btn';
    deleteBtn.innerHTML = '×';
    deleteBtn.title = 'Delete parameter';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      showDeleteConfirmDialog(param.name, () => {
        deleteParameter(index, param.name, param.in);
      });
    });
    actionsCell.appendChild(deleteBtn);
    row.appendChild(actionsCell);

    return row;
  }

  function createEditableTableCell(value, field, paramIndex, options = null) {
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
        // Create select dropdown for predefined options
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

        // Save if value changed
        if (newValue !== currentValue) {
          saveParameter(paramIndex, field, newValue);
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
  }

  function saveParameter(paramIndex, field, value) {
    if (!currentEndpoint || !currentEndpoint.parameters[paramIndex]) return;

    const param = currentEndpoint.parameters[paramIndex];

    vscode.postMessage({
      type: 'updateParameter',
      payload: {
        filePath: currentEndpoint.filePath,
        path: currentEndpoint.path,
        method: currentEndpoint.method,
        paramName: param.name,
        paramIn: param.in,
        field,
        value
      }
    });

    // Update local state
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
  }

  function deleteParameter(paramIndex, paramName, paramIn) {
    console.log('deleteParameter called:', paramIndex, paramName, paramIn);
    if (!currentEndpoint) {
      console.log('No currentEndpoint, returning');
      return;
    }

    console.log('Sending deleteParameter message to extension');
    vscode.postMessage({
      type: 'deleteParameter',
      payload: {
        filePath: currentEndpoint.filePath,
        path: currentEndpoint.path,
        method: currentEndpoint.method,
        paramName,
        paramIn
      }
    });

    // Update local state
    currentEndpoint.parameters.splice(paramIndex, 1);

    // Re-render parameters table
    parametersContent.innerHTML = '';
    if (currentEndpoint.parameters.length > 0) {
      parametersContent.appendChild(createEditableParametersTable(currentEndpoint.parameters));
    } else {
      parametersSection.style.display = 'none';
    }
  }

  function showDeleteConfirmDialog(paramName, onConfirm) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-dialog">
        <h4>Delete Parameter</h4>
        <p>Are you sure you want to delete parameter "${escapeHtml(paramName)}"?</p>
        <div class="modal-actions">
          <button class="secondary-btn" id="cancel-delete">Cancel</button>
          <button class="primary-btn" id="confirm-delete" style="background-color: var(--vscode-errorForeground);">Delete</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Handle cancel
    document.getElementById('cancel-delete').addEventListener('click', () => {
      modal.remove();
    });

    // Handle click outside
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    // Handle escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    // Handle confirm
    document.getElementById('confirm-delete').addEventListener('click', () => {
      modal.remove();
      onConfirm();
    });
  }

  function showAddParameterDialog() {
    // Create modal dialog
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-dialog">
        <h4>Add Parameter</h4>
        <div class="modal-field">
          <label>Name</label>
          <input type="text" id="new-param-name" placeholder="parameterName">
        </div>
        <div class="modal-field">
          <label>Location</label>
          <select id="new-param-in">
            <option value="query">query</option>
            <option value="header">header</option>
            <option value="path">path</option>
            <option value="cookie">cookie</option>
          </select>
        </div>
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

    // Focus name input
    document.getElementById('new-param-name').focus();

    // Handle cancel
    document.getElementById('cancel-add-param').addEventListener('click', () => {
      modal.remove();
    });

    // Handle click outside
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    // Handle escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    // Handle add
    document.getElementById('confirm-add-param').addEventListener('click', () => {
      const name = document.getElementById('new-param-name').value.trim();
      const paramIn = document.getElementById('new-param-in').value;
      const type = document.getElementById('new-param-type').value;
      const required = document.getElementById('new-param-required').checked;
      const description = document.getElementById('new-param-description').value.trim();

      if (!name) {
        alert('Parameter name is required');
        return;
      }

      // Check for duplicate
      const exists = currentEndpoint.parameters?.some(p => p.name === name && p.in === paramIn);
      if (exists) {
        alert(`Parameter "${name}" (${paramIn}) already exists`);
        return;
      }

      addParameter({ name, in: paramIn, type, required, description });
      modal.remove();
    });
  }

  function addParameter(param) {
    if (!currentEndpoint) return;

    vscode.postMessage({
      type: 'addParameter',
      payload: {
        filePath: currentEndpoint.filePath,
        path: currentEndpoint.path,
        method: currentEndpoint.method,
        parameter: param
      }
    });

    // Update local state
    if (!currentEndpoint.parameters) {
      currentEndpoint.parameters = [];
    }
    currentEndpoint.parameters.push({
      name: param.name,
      in: param.in,
      required: param.required,
      description: param.description || undefined,
      schema: { type: param.type }
    });

    // Re-render parameters table
    parametersSection.style.display = 'block';
    parametersContent.innerHTML = '';
    parametersContent.appendChild(createEditableParametersTable(currentEndpoint.parameters));
  }

  function showEndpoint(endpoint, servers) {
    currentEndpoint = endpoint;
    currentServers = servers || [];

    // Update header
    methodBadge.textContent = endpoint.method.toUpperCase();
    methodBadge.className = 'method-badge ' + endpoint.method;

    // Make path editable
    endpointPath.textContent = endpoint.path;
    endpointPath.className = 'endpoint-path editable';
    endpointPath.title = 'Click to edit path';

    // Remove old listener if exists
    const newEndpointPath = endpointPath.cloneNode(true);
    endpointPath.parentNode.replaceChild(newEndpointPath, endpointPath);

    // Update reference
    const pathElement = document.getElementById('endpoint-path');
    pathElement.addEventListener('click', () => {
      if (pathElement.classList.contains('editing')) return;

      pathElement.classList.add('editing');
      const currentValue = currentEndpoint.path;

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'path-edit-input';
      input.value = currentValue;

      pathElement.textContent = '';
      pathElement.appendChild(input);
      input.focus();
      input.select();

      const finishEdit = () => {
        const newValue = input.value.trim();
        pathElement.classList.remove('editing');
        pathElement.textContent = newValue || currentValue;

        if (newValue && newValue !== currentValue) {
          savePath(currentValue, newValue);
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

    // Update metadata with inline editable fields
    metadataContent.innerHTML = '';
    metadataContent.appendChild(createEditableField('Summary', 'summary', endpoint.summary));
    metadataContent.appendChild(createEditableField('Description', 'description', endpoint.description, true));
    metadataContent.appendChild(createEditableField('Operation ID', 'operationId', endpoint.operationId));
    metadataContent.appendChild(createTagsField('Tags', endpoint.tags || []));
    metadataContent.appendChild(createDeprecatedField(endpoint.deprecated));

    // Update parameters
    if (endpoint.parameters && endpoint.parameters.length) {
      parametersSection.style.display = 'block';
      parametersContent.innerHTML = '';
      parametersContent.appendChild(createEditableParametersTable(endpoint.parameters));
    } else {
      parametersSection.style.display = 'none';
    }

    // Update request body
    if (endpoint.requestBody) {
      requestBodySection.style.display = 'block';
      let bodyHtml = '';
      if (endpoint.requestBody.description) {
        bodyHtml += `<p>${escapeHtml(endpoint.requestBody.description)}</p>`;
      }
      for (const [contentType, media] of Object.entries(endpoint.requestBody.content || {})) {
        const componentName = media.schema?.$ref ? `<span class="component-badge">${escapeHtml(media.schema.$ref)}</span>` : '';
        bodyHtml += `<h5>${escapeHtml(contentType)} ${componentName}</h5>`;
        if (media.schema) {
          bodyHtml += `<div class="schema-viewer">${renderSchema(media.schema)}</div>`;
        }
      }
      requestBodyContent.innerHTML = bodyHtml || '<em>No schema defined</em>';
    } else {
      requestBodySection.style.display = 'none';
    }

    // Update responses
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

    // Setup request builder
    setupRequestBuilder(endpoint, servers);

    // Reset response
    noResponse.classList.remove('hidden');
    document.getElementById('response-status').style.display = 'none';
    document.getElementById('response-tabs').style.display = 'none';
    document.getElementById('response-toolbar').style.display = 'none';
    document.getElementById('response-search').style.display = 'none';
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  }

  function setupRequestBuilder(endpoint, servers) {
    // Base URL
    baseUrlInput.value = servers.length > 0 ? servers[0].url : '';

    // Path parameters
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

    // Query parameters
    queryParamsTable.innerHTML = '';
    const queryParams = endpoint.parameters?.filter(p => p.in === 'query') || [];
    queryParams.forEach(p => {
      addParamRow(queryParamsTable, p.name, '', true);
    });

    // Headers
    headersTable.innerHTML = '';
    const headerParams = endpoint.parameters?.filter(p => p.in === 'header') || [];
    headerParams.forEach(p => {
      addParamRow(headersTable, p.name, '', true);
    });

    // Body
    const hasBody = ['post', 'put', 'patch'].includes(endpoint.method);
    document.getElementById('body-container').style.display = hasBody ? 'block' : 'none';
    bodyEditor.value = '';

    if (endpoint.requestBody?.content) {
      const contentTypes = Object.keys(endpoint.requestBody.content);
      contentTypeSelect.innerHTML = contentTypes.map(ct =>
        `<option value="${escapeHtml(ct)}">${escapeHtml(ct)}</option>`
      ).join('');
    }
  }

  function addParamRow(table, key = '', value = '', enabled = true) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><input type="checkbox" ${enabled ? 'checked' : ''}></td>
      <td><input type="text" value="${escapeHtml(key)}" placeholder="Key"></td>
      <td><input type="text" value="${escapeHtml(value)}" placeholder="Value"></td>
      <td><button class="delete-btn">×</button></td>
    `;
    row.querySelector('.delete-btn').addEventListener('click', () => row.remove());
    table.appendChild(row);
  }

  function generateBodyFromSchema() {
    if (!currentEndpoint?.requestBody?.content) return;

    const contentType = contentTypeSelect.value;
    const media = currentEndpoint.requestBody.content[contentType];
    if (media?.schema) {
      const sample = generateSampleFromSchema(media.schema);
      bodyEditor.value = JSON.stringify(sample, null, 2);
    }
  }

  function generateSampleFromSchema(schema) {
    if (!schema) return null;

    if (schema.example !== undefined) return schema.example;
    if (schema.default !== undefined) return schema.default;

    switch (schema.type) {
      case 'object':
        const obj = {};
        if (schema.properties) {
          for (const [key, prop] of Object.entries(schema.properties)) {
            obj[key] = generateSampleFromSchema(prop);
          }
        }
        return obj;
      case 'array':
        return [generateSampleFromSchema(schema.items)];
      case 'string':
        if (schema.enum) return schema.enum[0];
        if (schema.format === 'date') return '2024-01-01';
        if (schema.format === 'date-time') return '2024-01-01T00:00:00Z';
        if (schema.format === 'email') return 'user@example.com';
        if (schema.format === 'uri') return 'https://example.com';
        return 'string';
      case 'number':
      case 'integer':
        return 0;
      case 'boolean':
        return true;
      default:
        return null;
    }
  }

  function sendRequest() {
    if (isLoading || !currentEndpoint) return;

    const config = buildRequestConfig();
    if (!config) return;

    setLoading(true);
    vscode.postMessage({ type: 'sendRequest', payload: config });
  }

  function buildRequestConfig() {
    const pathParams = {};
    pathParamsContainer.querySelectorAll('input[data-param]').forEach(input => {
      pathParams[input.dataset.param] = input.value;
    });

    // Validate required path params
    const requiredPathParams = currentEndpoint.parameters?.filter(p => p.in === 'path' && p.required) || [];
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
      path: currentEndpoint.path,
      method: currentEndpoint.method,
      pathParams,
      queryParams,
      headers,
      body: bodyEditor.value || undefined,
      contentType: contentTypeSelect.value
    };
  }

  function cancelRequest() {
    vscode.postMessage({ type: 'cancelRequest' });
    setLoading(false);
  }

  function setLoading(loading) {
    isLoading = loading;
    sendBtn.disabled = loading;
    sendBtn.style.display = loading ? 'none' : 'inline-block';
    cancelBtn.style.display = loading ? 'inline-block' : 'none';
    loadingIndicator.style.display = loading ? 'inline' : 'none';

    if (loading) {
      startTime = Date.now();
      elapsedInterval = setInterval(() => {
        elapsedTime.textContent = `${((Date.now() - startTime) / 1000).toFixed(1)}s`;
      }, 100);
    } else {
      clearInterval(elapsedInterval);
      elapsedTime.textContent = '';
    }
  }

  function showResponse(response) {
    lastResponse = response;
    setLoading(false);

    noResponse.classList.add('hidden');
    document.getElementById('response-status').style.display = 'flex';
    document.getElementById('response-tabs').style.display = 'flex';
    document.getElementById('response-toolbar').style.display = 'flex';
    document.getElementById('response-search').style.display = 'flex';

    // Status
    statusCode.textContent = `${response.status} ${response.statusText}`;
    statusCode.className = getStatusClass(response.status);

    responseTime.textContent = `${response.time}ms`;
    responseSize.textContent = formatSize(response.size);

    // Body
    updateResponseBody();

    // Headers
    responseHeadersTable.innerHTML = '';
    for (const [key, value] of Object.entries(response.headers)) {
      const row = document.createElement('tr');
      row.innerHTML = `<td><strong>${escapeHtml(key)}</strong></td><td>${escapeHtml(value)}</td>`;
      responseHeadersTable.appendChild(row);
    }

    switchTab('body');
  }

  function updateResponseBody() {
    if (!lastResponse) return;

    let body = lastResponse.body;
    if (prettyPrint.checked && lastResponse.contentType?.includes('json')) {
      try {
        body = JSON.stringify(JSON.parse(body), null, 2);
      } catch {}
    }

    responseBody.textContent = body;
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.getElementById('response-body-tab').style.display = 'block';
  }

  function showError(message, details) {
    setLoading(false);
    noResponse.classList.remove('hidden');
    noResponse.innerHTML = `<div style="color: var(--vscode-errorForeground);">
      <strong>Error:</strong> ${escapeHtml(message)}
      ${details ? `<br><small>${escapeHtml(details)}</small>` : ''}
    </div>`;
  }

  function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.getElementById(`response-${tab}-tab`).style.display = 'block';
  }

  function copyResponse() {
    if (lastResponse) {
      navigator.clipboard.writeText(lastResponse.body);
    }
  }

  function copyCurl() {
    if (!currentEndpoint) return;

    const config = buildRequestConfig();
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
  }

  function saveResponse() {
    if (lastResponse) {
      vscode.postMessage({ type: 'saveResponse', payload: lastResponse });
    }
  }

  let searchMatches = [];
  let currentMatchIndex = -1;

  function searchInResponse() {
    const query = searchInput.value.toLowerCase();
    searchMatches = [];
    currentMatchIndex = -1;

    if (!query || !lastResponse) {
      document.getElementById('search-results').textContent = '';
      updateResponseBody();
      return;
    }

    const body = responseBody.textContent;
    let index = 0;
    while ((index = body.toLowerCase().indexOf(query, index)) !== -1) {
      searchMatches.push(index);
      index += query.length;
    }

    document.getElementById('search-results').textContent =
      searchMatches.length ? `${searchMatches.length} matches` : 'No matches';

    if (searchMatches.length) {
      currentMatchIndex = 0;
      highlightMatches(query);
    }
  }

  function highlightMatches(query) {
    if (!lastResponse) return;

    let body = responseBody.textContent;
    let html = '';
    let lastIndex = 0;

    searchMatches.forEach((matchIndex, i) => {
      html += escapeHtml(body.substring(lastIndex, matchIndex));
      const matchText = body.substring(matchIndex, matchIndex + query.length);
      const className = i === currentMatchIndex ? 'highlight current' : 'highlight';
      html += `<span class="${className}">${escapeHtml(matchText)}</span>`;
      lastIndex = matchIndex + query.length;
    });

    html += escapeHtml(body.substring(lastIndex));
    responseBody.innerHTML = html;
  }

  function navigateSearch(direction) {
    if (!searchMatches.length) return;

    currentMatchIndex = (currentMatchIndex + direction + searchMatches.length) % searchMatches.length;
    highlightMatches(searchInput.value.toLowerCase());
  }

  function updateEnvironments(environments, activeId) {
    environmentSelect.innerHTML = '<option value="">No Environment</option>';
    environments.forEach(env => {
      const option = document.createElement('option');
      option.value = env.id;
      option.textContent = env.name;
      if (env.id === activeId) option.selected = true;
      environmentSelect.appendChild(option);
    });
  }

  function renderSchema(schema, indent = 0, isLast = true) {
    if (!schema) return '';

    const pad = '  '.repeat(indent);
    const nextPad = '  '.repeat(indent + 1);
    let html = '';

    if (schema.type === 'object' && schema.properties) {
      const props = Object.entries(schema.properties);
      if (props.length === 0) {
        html += `<span class="json-brace">{}</span>`;
      } else {
        html += `<span class="json-brace">{</span>\n`;
        props.forEach(([key, prop], i) => {
          const isLastProp = i === props.length - 1;
          const required = schema.required?.includes(key);
          const requiredMark = required ? '<span class="json-required">*</span>' : '';
          const comma = isLastProp ? '' : '<span class="json-comma">,</span>';
          const desc = prop.description ? `<span class="json-comment"> // ${escapeHtml(prop.description)}</span>` : '';

          html += `${nextPad}<span class="json-key">"${escapeHtml(key)}"</span>${requiredMark}<span class="json-colon">:</span> `;
          html += renderSchemaValue(prop, indent + 1, isLastProp);
          html += `${comma}${desc}\n`;
        });
        html += `${pad}<span class="json-brace">}</span>`;
      }
    } else if (schema.type === 'array' && schema.items) {
      html += `<span class="json-bracket">[</span>\n`;
      html += `${nextPad}${renderSchemaValue(schema.items, indent + 1, true)}\n`;
      html += `${pad}<span class="json-bracket">]</span>`;
    } else {
      html += renderSchemaValue(schema, indent, isLast);
    }

    return html;
  }

  function renderSchemaValue(schema, indent = 0, isLast = true) {
    if (!schema) return '<span class="json-null">null</span>';

    const pad = '  '.repeat(indent);
    const nextPad = '  '.repeat(indent + 1);

    // Show component reference badge for nested $ref schemas
    const refBadge = schema.$ref ? `<span class="json-ref">#${escapeHtml(schema.$ref)}</span> ` : '';

    // Handle nested objects
    if (schema.type === 'object' && schema.properties) {
      const props = Object.entries(schema.properties);
      if (props.length === 0) {
        return `${refBadge}<span class="json-brace">{}</span>`;
      }
      let html = `${refBadge}<span class="json-brace">{</span>\n`;
      props.forEach(([key, prop], i) => {
        const isLastProp = i === props.length - 1;
        const required = schema.required?.includes(key);
        const requiredMark = required ? '<span class="json-required">*</span>' : '';
        const comma = isLastProp ? '' : '<span class="json-comma">,</span>';
        const desc = prop.description ? `<span class="json-comment"> // ${escapeHtml(prop.description)}</span>` : '';

        html += `${nextPad}<span class="json-key">"${escapeHtml(key)}"</span>${requiredMark}<span class="json-colon">:</span> `;
        html += renderSchemaValue(prop, indent + 1, isLastProp);
        html += `${comma}${desc}\n`;
      });
      html += `${pad}<span class="json-brace">}</span>`;
      return html;
    }

    // Handle arrays
    if (schema.type === 'array' && schema.items) {
      let html = `${refBadge}<span class="json-bracket">[</span>\n`;
      html += `${nextPad}${renderSchemaValue(schema.items, indent + 1, true)}\n`;
      html += `${pad}<span class="json-bracket">]</span>`;
      return html;
    }

    // Handle primitive types with example values
    const type = schema.type || 'any';
    const format = schema.format ? ` <span class="json-format">(${schema.format})</span>` : '';
    const example = schema.example !== undefined ? `: <span class="json-example">${formatExampleValue(schema.example)}</span>` : '';
    const enumValues = schema.enum ? ` <span class="json-enum">[${schema.enum.map(e => `"${e}"`).join(' | ')}]</span>` : '';

    return `${refBadge}<span class="json-type">${type}</span>${format}${example}${enumValues}`;
  }

  function formatExampleValue(value) {
    if (value === null) return '<span class="json-null">null</span>';
    if (typeof value === 'string') return `<span class="json-string">"${escapeHtml(value)}"</span>`;
    if (typeof value === 'number') return `<span class="json-number">${value}</span>`;
    if (typeof value === 'boolean') return `<span class="json-boolean">${value}</span>`;
    if (Array.isArray(value)) return `<span class="json-array">${escapeHtml(JSON.stringify(value))}</span>`;
    if (typeof value === 'object') return `<span class="json-object">${escapeHtml(JSON.stringify(value))}</span>`;
    return escapeHtml(String(value));
  }

  function getStatusClass(status) {
    const code = parseInt(status, 10);
    if (code >= 200 && code < 300) return 'status-2xx';
    if (code >= 300 && code < 400) return 'status-3xx';
    if (code >= 400 && code < 500) return 'status-4xx';
    if (code >= 500) return 'status-5xx';
    return '';
  }

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  init();
})();
