// Components tab logic for SuperAPI webview
(function() {
  const S = window.SuperAPI;

  S.renderComponents = function() {
    const escapeHtml = S.escapeHtml;
    const capitalizeFirst = S.capitalizeFirst;
    const componentsContent = document.getElementById('components-content');
    if (!componentsContent || !S.currentComponents) return;

    componentsContent.innerHTML = '';

    for (const [category, items] of Object.entries(S.currentComponents)) {
      const categorySection = document.createElement('section');
      categorySection.className = 'section';

      const categoryHeader = document.createElement('h3');
      categoryHeader.className = 'section-header collapsible';
      categoryHeader.textContent = capitalizeFirst(category);
      categoryHeader.addEventListener('click', () => {
        categoryHeader.classList.toggle('collapsed');
        categoryContent.classList.toggle('hidden');
      });

      const categoryContent = document.createElement('div');
      categoryContent.className = 'section-content';

      for (const [name, schema] of Object.entries(items)) {
        const componentCard = document.createElement('div');
        componentCard.className = 'component-card';

        const componentHeader = document.createElement('div');
        componentHeader.className = 'component-header';

        const componentName = document.createElement('span');
        componentName.className = 'component-name';
        componentName.textContent = name;

        const componentType = document.createElement('span');
        componentType.className = 'component-type';
        componentType.textContent = schema.type || 'object';

        componentHeader.appendChild(componentName);
        componentHeader.appendChild(componentType);
        componentCard.appendChild(componentHeader);

        if (schema.description) {
          const componentDesc = document.createElement('div');
          componentDesc.className = 'component-description';
          componentDesc.textContent = schema.description;
          componentCard.appendChild(componentDesc);
        }

        if (schema.properties) {
          const propsTable = document.createElement('table');
          propsTable.className = 'component-props-table';

          const thead = document.createElement('thead');
          thead.innerHTML = '<tr><th>Property</th><th>Type</th><th>Description</th></tr>';
          propsTable.appendChild(thead);

          const tbody = document.createElement('tbody');
          for (const [propName, propSchema] of Object.entries(schema.properties)) {
            const row = document.createElement('tr');

            const nameCell = document.createElement('td');
            const isRequired = schema.required && schema.required.includes(propName);
            nameCell.innerHTML = `<code>${escapeHtml(propName)}</code>${isRequired ? '<span class="required-badge">required</span>' : ''}`;

            const typeCell = document.createElement('td');
            let typeStr = propSchema.type || 'any';
            if (propSchema.$ref) {
              typeStr = `<a class="schema-ref" href="#" data-ref="${escapeHtml(propSchema.$ref)}">${escapeHtml(propSchema.$ref)}</a>`;
            } else if (propSchema.type === 'array' && propSchema.items) {
              if (propSchema.items.$ref) {
                typeStr = `array&lt;<a class="schema-ref" href="#" data-ref="${escapeHtml(propSchema.items.$ref)}">${escapeHtml(propSchema.items.$ref)}</a>&gt;`;
              } else {
                typeStr = `array&lt;${escapeHtml(propSchema.items.type || 'any')}&gt;`;
              }
            }
            if (propSchema.format) {
              typeStr += ` (${escapeHtml(propSchema.format)})`;
            }
            typeCell.innerHTML = typeStr;

            const descCell = document.createElement('td');
            descCell.textContent = propSchema.description || '';

            row.appendChild(nameCell);
            row.appendChild(typeCell);
            row.appendChild(descCell);
            tbody.appendChild(row);
          }
          propsTable.appendChild(tbody);
          componentCard.appendChild(propsTable);
        }

        if (schema.enum) {
          const enumDiv = document.createElement('div');
          enumDiv.className = 'component-enum';
          enumDiv.innerHTML = '<strong>Enum values:</strong> ' + schema.enum.map(v => `<code>${escapeHtml(String(v))}</code>`).join(', ');
          componentCard.appendChild(enumDiv);
        }

        categoryContent.appendChild(componentCard);
      }

      categorySection.appendChild(categoryHeader);
      categorySection.appendChild(categoryContent);
      componentsContent.appendChild(categorySection);
    }
  };

  S.handleShowSchemaFile = function(payload) {
    const escapeHtml = S.escapeHtml;
    const container = document.getElementById('app');
    if (!container) return;

    S.currentComponents = payload.components;
    S.currentFilePath = payload.filePath;

    container.innerHTML = `
      <div id="header">
        <div id="endpoint-info">
          <span class="method-badge schema-badge">SCHEMA</span>
          <span id="endpoint-path">${escapeHtml(payload.title || 'Schemas')}</span>
        </div>
      </div>

      <div id="main-tabs">
        <button class="main-tab-btn active" data-main-tab="components">Schemas</button>
      </div>

      <div id="content">
        <div id="components-tab" class="main-tab-content active">
          <div id="endpoint-details">
            <div class="section-header-with-action" style="margin-bottom: 16px;">
              <h3 class="section-header">Schemas</h3>
              <button class="add-server-btn" id="add-schema-btn">+ Add Schema</button>
            </div>
            <div id="schemas-editable-content"></div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('add-schema-btn').addEventListener('click', function() {
      S.showSchemaDialog();
    });

    S.renderEditableSchemas();
  };

  S.showSchemaDialog = function() {
    var existingDialog = document.querySelector('.server-dialog-overlay');
    if (existingDialog) existingDialog.remove();

    var overlay = document.createElement('div');
    overlay.className = 'server-dialog-overlay';

    var dialog = document.createElement('div');
    dialog.className = 'server-dialog';

    var title = document.createElement('h3');
    title.textContent = 'Add Schema';

    var form = document.createElement('div');
    form.className = 'server-form';

    var nameLabel = document.createElement('label');
    nameLabel.textContent = 'Name *';
    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'server-input';
    nameInput.placeholder = 'e.g., User';

    var typeLabel = document.createElement('label');
    typeLabel.textContent = 'Type';
    var typeSelect = document.createElement('select');
    typeSelect.className = 'server-input';
    ['object', 'array', 'string', 'integer', 'number', 'boolean'].forEach(function(t) {
      var opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      typeSelect.appendChild(opt);
    });

    form.appendChild(nameLabel);
    form.appendChild(nameInput);
    form.appendChild(typeLabel);
    form.appendChild(typeSelect);

    var buttons = document.createElement('div');
    buttons.className = 'server-dialog-buttons';

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'server-dialog-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', function() { overlay.remove(); });

    var saveBtn = document.createElement('button');
    saveBtn.className = 'server-dialog-save';
    saveBtn.textContent = 'Add';
    saveBtn.addEventListener('click', function() {
      var name = nameInput.value.trim();
      if (!name) { nameInput.classList.add('error'); return; }

      S.vscode.postMessage({
        type: 'addSchema',
        payload: { filePath: S.currentFilePath, schemaName: name, schemaType: typeSelect.value }
      });
      overlay.remove();
    });

    buttons.appendChild(cancelBtn);
    buttons.appendChild(saveBtn);
    dialog.appendChild(title);
    dialog.appendChild(form);
    dialog.appendChild(buttons);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    nameInput.focus();

    var handleKeydown = function(e) {
      if (e.key === 'Enter') saveBtn.click();
      else if (e.key === 'Escape') overlay.remove();
    };
    nameInput.addEventListener('keydown', handleKeydown);
  };

  S.showPropertyDialog = function(schemaName) {
    var existingDialog = document.querySelector('.server-dialog-overlay');
    if (existingDialog) existingDialog.remove();

    var overlay = document.createElement('div');
    overlay.className = 'server-dialog-overlay';

    var dialog = document.createElement('div');
    dialog.className = 'server-dialog';

    var title = document.createElement('h3');
    title.textContent = 'Add Property to ' + schemaName;

    var form = document.createElement('div');
    form.className = 'server-form';

    var nameLabel = document.createElement('label');
    nameLabel.textContent = 'Name *';
    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'server-input';
    nameInput.placeholder = 'e.g., username';

    var typeLabel = document.createElement('label');
    typeLabel.textContent = 'Type';
    var typeSelect = document.createElement('select');
    typeSelect.className = 'server-input';
    ['string', 'integer', 'number', 'boolean', 'object', 'array'].forEach(function(t) {
      var opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      typeSelect.appendChild(opt);
    });

    var descLabel = document.createElement('label');
    descLabel.textContent = 'Description';
    var descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.className = 'server-input';
    descInput.placeholder = 'Property description';

    var reqLabel = document.createElement('label');
    reqLabel.className = 'schema-checkbox-label';
    var reqCheckbox = document.createElement('input');
    reqCheckbox.type = 'checkbox';
    reqLabel.appendChild(reqCheckbox);
    reqLabel.appendChild(document.createTextNode(' Required'));

    form.appendChild(nameLabel);
    form.appendChild(nameInput);
    form.appendChild(typeLabel);
    form.appendChild(typeSelect);
    form.appendChild(descLabel);
    form.appendChild(descInput);
    form.appendChild(reqLabel);

    var buttons = document.createElement('div');
    buttons.className = 'server-dialog-buttons';

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'server-dialog-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', function() { overlay.remove(); });

    var saveBtn = document.createElement('button');
    saveBtn.className = 'server-dialog-save';
    saveBtn.textContent = 'Add';
    saveBtn.addEventListener('click', function() {
      var name = nameInput.value.trim();
      if (!name) { nameInput.classList.add('error'); return; }

      var property = {
        name: name,
        type: typeSelect.value,
        description: descInput.value.trim() || undefined,
        required: reqCheckbox.checked
      };

      S.vscode.postMessage({
        type: 'addSchemaProperty',
        payload: { filePath: S.currentFilePath, schemaName: schemaName, property: property }
      });
      overlay.remove();
    });

    buttons.appendChild(cancelBtn);
    buttons.appendChild(saveBtn);
    dialog.appendChild(title);
    dialog.appendChild(form);
    dialog.appendChild(buttons);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    nameInput.focus();

    var handleKeydown = function(e) {
      if (e.key === 'Enter') saveBtn.click();
      else if (e.key === 'Escape') overlay.remove();
    };
    nameInput.addEventListener('keydown', handleKeydown);
    descInput.addEventListener('keydown', handleKeydown);
  };

  S.renderEditableSchemas = function() {
    var escapeHtml = S.escapeHtml;
    var container = document.getElementById('schemas-editable-content');
    if (!container || !S.currentComponents) return;

    container.innerHTML = '';

    var schemas = S.currentComponents.schemas || {};
    var schemaNames = Object.keys(schemas);

    if (schemaNames.length === 0) {
      var emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.innerHTML = '<p>No schemas defined</p><p class="empty-state-hint">Click "+ Add Schema" to create one</p>';
      container.appendChild(emptyState);
      return;
    }

    schemaNames.forEach(function(name) {
      var schema = schemas[name];
      var card = document.createElement('div');
      card.className = 'component-card';

      // Header with name, type, and actions
      var header = document.createElement('div');
      header.className = 'component-header';

      var nameSpan = document.createElement('span');
      nameSpan.className = 'component-name';
      nameSpan.textContent = name;

      var typeSpan = document.createElement('span');
      typeSpan.className = 'component-type';
      typeSpan.textContent = schema.type || 'object';

      var headerActions = document.createElement('div');
      headerActions.className = 'schema-header-actions';

      var addPropBtn = document.createElement('button');
      addPropBtn.className = 'schema-action-btn add';
      addPropBtn.textContent = '+ Property';
      addPropBtn.title = 'Add property';
      addPropBtn.addEventListener('click', function() {
        S.showPropertyDialog(name);
      });

      var deleteSchemaBtn = document.createElement('button');
      deleteSchemaBtn.className = 'schema-action-btn delete';
      deleteSchemaBtn.textContent = 'Delete';
      deleteSchemaBtn.title = 'Delete schema';
      deleteSchemaBtn.addEventListener('click', function() {
        if (confirm('Delete schema "' + name + '"?')) {
          S.vscode.postMessage({
            type: 'deleteSchema',
            payload: { filePath: S.currentFilePath, schemaName: name }
          });
        }
      });

      headerActions.appendChild(addPropBtn);
      headerActions.appendChild(deleteSchemaBtn);

      header.appendChild(nameSpan);
      header.appendChild(typeSpan);
      header.appendChild(headerActions);
      card.appendChild(header);

      // Properties table
      if (schema.properties && Object.keys(schema.properties).length > 0) {
        var table = document.createElement('table');
        table.className = 'component-props-table';

        var thead = document.createElement('thead');
        thead.innerHTML = '<tr><th>Property</th><th>Type</th><th>Description</th><th>Required</th><th></th></tr>';
        table.appendChild(thead);

        var tbody = document.createElement('tbody');
        for (var propName in schema.properties) {
          (function(pName) {
            var propSchema = schema.properties[pName];
            var row = document.createElement('tr');

            // Name cell - editable
            var nameCell = document.createElement('td');
            var nameCode = document.createElement('code');
            nameCode.className = 'editable-cell';
            nameCode.textContent = pName;
            nameCode.title = 'Click to rename';
            nameCode.addEventListener('click', function() {
              var input = document.createElement('input');
              input.type = 'text';
              input.className = 'inline-edit-input';
              input.value = pName;
              nameCode.textContent = '';
              nameCode.appendChild(input);
              input.focus();
              input.select();

              var finish = function() {
                var newName = input.value.trim();
                if (newName && newName !== pName) {
                  S.vscode.postMessage({
                    type: 'updateSchemaProperty',
                    payload: { filePath: S.currentFilePath, schemaName: name, propertyName: pName, updates: { name: newName } }
                  });
                } else {
                  nameCode.textContent = pName;
                }
              };
              input.addEventListener('blur', finish);
              input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') { input.blur(); }
                else if (e.key === 'Escape') { nameCode.textContent = pName; }
              });
            });
            nameCell.appendChild(nameCode);

            // Type cell - editable via select
            var typeCell = document.createElement('td');
            var typeSpanCell = document.createElement('span');
            typeSpanCell.className = 'editable-cell';
            typeSpanCell.textContent = propSchema.type || 'any';
            typeSpanCell.title = 'Click to change type';
            typeSpanCell.addEventListener('click', function(e) {
              e.preventDefault();
              e.stopPropagation();

              // Prevent multiple selects
              if (typeSpanCell.querySelector('select')) return;

              var select = document.createElement('select');
              select.className = 'inline-edit-input';
              ['string', 'integer', 'number', 'boolean', 'object', 'array'].forEach(function(t) {
                var opt = document.createElement('option');
                opt.value = t;
                opt.textContent = t;
                if (t === (propSchema.type || 'string')) opt.selected = true;
                select.appendChild(opt);
              });
              typeSpanCell.textContent = '';
              typeSpanCell.appendChild(select);

              // Use setTimeout to ensure focus happens after current event cycle
              setTimeout(function() {
                select.focus();
                select.click();
              }, 0);

              var finished = false;
              var finish = function() {
                if (finished) return;
                finished = true;
                var newType = select.value;
                if (newType !== propSchema.type) {
                  S.vscode.postMessage({
                    type: 'updateSchemaProperty',
                    payload: { filePath: S.currentFilePath, schemaName: name, propertyName: pName, updates: { type: newType } }
                  });
                } else {
                  typeSpanCell.textContent = propSchema.type || 'any';
                }
              };

              select.addEventListener('blur', finish);
              select.addEventListener('change', finish);
            });
            typeCell.appendChild(typeSpanCell);

            // Description cell - editable
            var descCell = document.createElement('td');
            var descSpan = document.createElement('span');
            descSpan.className = 'editable-cell';
            descSpan.textContent = propSchema.description || '—';
            if (!propSchema.description) descSpan.classList.add('empty');
            descSpan.title = 'Click to edit description';
            descSpan.addEventListener('click', function() {
              var input = document.createElement('input');
              input.type = 'text';
              input.className = 'inline-edit-input';
              input.value = propSchema.description || '';
              input.placeholder = 'Description...';
              descSpan.textContent = '';
              descSpan.appendChild(input);
              input.focus();

              var finish = function() {
                var newDesc = input.value.trim();
                if (newDesc !== (propSchema.description || '')) {
                  S.vscode.postMessage({
                    type: 'updateSchemaProperty',
                    payload: { filePath: S.currentFilePath, schemaName: name, propertyName: pName, updates: { description: newDesc } }
                  });
                } else {
                  descSpan.textContent = propSchema.description || '—';
                  if (!propSchema.description) descSpan.classList.add('empty');
                }
              };
              input.addEventListener('blur', finish);
              input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') input.blur();
                else if (e.key === 'Escape') {
                  descSpan.textContent = propSchema.description || '—';
                  if (!propSchema.description) descSpan.classList.add('empty');
                }
              });
            });
            descCell.appendChild(descSpan);

            // Required cell - checkbox
            var reqCell = document.createElement('td');
            var reqCheckbox = document.createElement('input');
            reqCheckbox.type = 'checkbox';
            reqCheckbox.checked = !!(schema.required && schema.required.includes(pName));
            reqCheckbox.addEventListener('change', function() {
              S.vscode.postMessage({
                type: 'updateSchemaProperty',
                payload: { filePath: S.currentFilePath, schemaName: name, propertyName: pName, updates: { required: reqCheckbox.checked } }
              });
            });
            reqCell.appendChild(reqCheckbox);

            // Delete cell
            var deleteCell = document.createElement('td');
            var deleteBtn = document.createElement('button');
            deleteBtn.className = 'schema-action-btn delete small';
            deleteBtn.textContent = '✕';
            deleteBtn.title = 'Delete property';
            deleteBtn.addEventListener('click', function() {
              if (confirm('Delete property "' + pName + '"?')) {
                S.vscode.postMessage({
                  type: 'deleteSchemaProperty',
                  payload: { filePath: S.currentFilePath, schemaName: name, propertyName: pName }
                });
              }
            });
            deleteCell.appendChild(deleteBtn);

            row.appendChild(nameCell);
            row.appendChild(typeCell);
            row.appendChild(descCell);
            row.appendChild(reqCell);
            row.appendChild(deleteCell);
            tbody.appendChild(row);
          })(propName);
        }
        table.appendChild(tbody);
        card.appendChild(table);
      } else {
        var emptyProps = document.createElement('div');
        emptyProps.className = 'empty-message';
        emptyProps.textContent = 'No properties. Click "+ Property" to add one.';
        card.appendChild(emptyProps);
      }

      container.appendChild(card);
    });
  };
})();
