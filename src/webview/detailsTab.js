// Details tab logic for SuperAPI webview
(function() {
  const S = window.SuperAPI;

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

    const parametersContent = document.getElementById('parameters-content');
    const parametersSection = document.getElementById('parameters-section');
    parametersContent.innerHTML = '';
    if (S.currentEndpoint.parameters.length > 0) {
      parametersContent.appendChild(S.createEditableParametersTable(S.currentEndpoint.parameters));
    } else {
      parametersSection.style.display = 'none';
    }
  };

  S.showAddParameterDialog = function() {
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
      const paramIn = document.getElementById('new-param-in').value;
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

    const parametersSection = document.getElementById('parameters-section');
    const parametersContent = document.getElementById('parameters-content');
    parametersSection.style.display = 'block';
    parametersContent.innerHTML = '';
    parametersContent.appendChild(S.createEditableParametersTable(S.currentEndpoint.parameters));
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

    const parametersSection = document.getElementById('parameters-section');
    const parametersContent = document.getElementById('parameters-content');
    if (endpoint.parameters && endpoint.parameters.length) {
      parametersSection.style.display = 'block';
      parametersContent.innerHTML = '';
      parametersContent.appendChild(S.createEditableParametersTable(endpoint.parameters));
    } else {
      parametersSection.style.display = 'none';
    }

    const escapeHtml = S.escapeHtml;
    const renderSchema = S.renderSchema;
    const getStatusClass = S.getStatusClass;

    const requestBodySection = document.getElementById('request-body-section');
    const requestBodyContent = document.getElementById('request-body-content');
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
