// Components tab logic for OpenAPI Puer webview
(function() {
  const S = window.OpenAPIPuer;

  // Helper: determine if a schema should use SchemaTable (object) or detail table (primitive)
  function isObjectSchema(schema) {
    return schema.type === 'object' || (!schema.type && schema.properties);
  }

  // Field definitions for non-object schema visual display
  var NON_OBJECT_FIELDS = {
    // Always available
    common: [
      { key: 'description', label: 'Description', inputType: 'text', placeholder: 'Schema description' },
      { key: 'example', label: 'Example', inputType: 'text', placeholder: 'Example value' },
      { key: 'default', label: 'Default', inputType: 'text', placeholder: 'Default value' },
      { key: 'nullable', label: 'Nullable', inputType: 'toggle' },
      { key: 'deprecated', label: 'Deprecated', inputType: 'toggle' },
      { key: 'readOnly', label: 'Read Only', inputType: 'toggle' },
      { key: 'writeOnly', label: 'Write Only', inputType: 'toggle' }
    ],
    // Type-specific fields
    string: [
      { key: 'format', label: 'Format', inputType: 'select', options: ['', 'date', 'date-time', 'email', 'uri', 'uuid', 'hostname', 'ipv4', 'ipv6', 'byte', 'binary', 'password'] },
      { key: 'enum', label: 'Enum', inputType: 'text', placeholder: 'Comma-separated values' },
      { key: 'pattern', label: 'Pattern', inputType: 'text', placeholder: 'e.g. ^[a-zA-Z]+$' },
      { key: 'minLength', label: 'Min Length', inputType: 'number', placeholder: '' },
      { key: 'maxLength', label: 'Max Length', inputType: 'number', placeholder: '' }
    ],
    integer: [
      { key: 'format', label: 'Format', inputType: 'select', options: ['', 'int32', 'int64'] },
      { key: 'enum', label: 'Enum', inputType: 'text', placeholder: 'Comma-separated values' },
      { key: 'minimum', label: 'Minimum', inputType: 'number', placeholder: '' },
      { key: 'maximum', label: 'Maximum', inputType: 'number', placeholder: '' }
    ],
    number: [
      { key: 'format', label: 'Format', inputType: 'select', options: ['', 'float', 'double'] },
      { key: 'enum', label: 'Enum', inputType: 'text', placeholder: 'Comma-separated values' },
      { key: 'minimum', label: 'Minimum', inputType: 'number', placeholder: '' },
      { key: 'maximum', label: 'Maximum', inputType: 'number', placeholder: '' }
    ],
    boolean: [],
    array: [
      { key: 'minItems', label: 'Min Items', inputType: 'number', placeholder: '' },
      { key: 'maxItems', label: 'Max Items', inputType: 'number', placeholder: '' },
      { key: 'uniqueItems', label: 'Unique Items', inputType: 'toggle' }
    ]
  };

  // Get all available fields for a given type
  function getFieldsForType(type) {
    var typeSpecific = NON_OBJECT_FIELDS[type] || [];
    return typeSpecific.concat(NON_OBJECT_FIELDS.common);
  }

  // Get the value of a schema field, handling special cases
  function getSchemaFieldValue(schema, key) {
    if (key === 'enum' && schema.enum) {
      return schema.enum.join(', ');
    }
    if (key === 'example' && schema.example !== undefined) {
      return typeof schema.example === 'object' ? JSON.stringify(schema.example) : String(schema.example);
    }
    if (key === 'default' && schema.default !== undefined) {
      return typeof schema.default === 'object' ? JSON.stringify(schema.default) : String(schema.default);
    }
    return schema[key];
  }

  // Check if a field exists in the schema
  function schemaHasField(schema, key) {
    if (key === 'enum') return schema.enum && schema.enum.length > 0;
    return schema[key] !== undefined && schema[key] !== null;
  }

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
    S.currentFileType = null;

    var hasSchemas = payload.components && payload.components.schemas && Object.keys(payload.components.schemas).length > 0;
    var hasParameters = payload.components && payload.components.parameters && Object.keys(payload.components.parameters).length > 0;
    var isParameterOnly = hasParameters && !hasSchemas;
    S.currentFileType = isParameterOnly ? 'parameter' : 'schema';

    // Build tabs HTML
    var tabsHtml = '';
    var contentHtml = '';

    if (isParameterOnly) {
      // Parameter-only file: show only Parameters tab
      tabsHtml = '<button class="main-tab-btn active" data-main-tab="comp-parameters">Parameters</button>';
      contentHtml = `
        <div id="comp-parameters-tab" class="main-tab-content active">
          <div id="endpoint-details">
            <div class="section-header-with-action" style="margin-bottom: 16px;">
              <h3 class="section-header">Parameters</h3>
              <button class="add-server-btn" id="add-comp-param-btn">+ Add Parameter</button>
            </div>
            <div id="comp-params-editable-content"></div>
          </div>
        </div>
      `;
    } else {
      // Schema file (may also have parameters): show both tabs
      tabsHtml = '<button class="main-tab-btn active" data-main-tab="components">Schemas</button>';
      if (hasParameters) {
        tabsHtml += '<button class="main-tab-btn" data-main-tab="comp-parameters">Parameters</button>';
      }
      contentHtml = `
        <div id="components-tab" class="main-tab-content active">
          <div id="endpoint-details">
            <div class="section-header-with-action" style="margin-bottom: 16px;">
              <h3 class="section-header">Schemas</h3>
              <button class="add-server-btn" id="add-schema-btn">+ Add Schema</button>
            </div>
            <div id="schemas-editable-content"></div>
          </div>
        </div>
      `;
      if (hasParameters) {
        contentHtml += `
          <div id="comp-parameters-tab" class="main-tab-content">
            <div id="endpoint-details">
              <div class="section-header-with-action" style="margin-bottom: 16px;">
                <h3 class="section-header">Parameters</h3>
                <button class="add-server-btn" id="add-comp-param-btn">+ Add Parameter</button>
              </div>
              <div id="comp-params-editable-content"></div>
            </div>
          </div>
        `;
      }
    }

    var badgeLabel = isParameterOnly ? 'PARAMS' : 'SCHEMA';

    container.innerHTML = `
      <div id="header">
        <div id="endpoint-info">
          <span class="method-badge schema-badge">${badgeLabel}</span>
          <span id="endpoint-path">${escapeHtml(payload.title || 'Schemas')}</span>
        </div>
      </div>

      <div id="main-tabs">
        ${tabsHtml}
      </div>

      <div id="content">
        ${contentHtml}
      </div>
    `;

    var addSchemaBtn = document.getElementById('add-schema-btn');
    if (addSchemaBtn) {
      addSchemaBtn.addEventListener('click', function() {
        S.showSchemaDialog();
      });
    }

    var addParamBtn = document.getElementById('add-comp-param-btn');
    if (addParamBtn) {
      addParamBtn.addEventListener('click', function() {
        S.showComponentParameterDialog();
      });
    }

    // Wire tab switching
    document.querySelectorAll('.main-tab-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        S.switchMainTab(btn.dataset.mainTab);
      });
    });

    if (!isParameterOnly) {
      S.renderEditableSchemas();
    }
    if (hasParameters) {
      S.renderEditableParameters();
    }
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

    // --- Advanced section (collapsible) ---
    var advToggle = document.createElement('div');
    advToggle.className = 'advanced-toggle';
    advToggle.textContent = '▶ Advanced';
    advToggle.style.cursor = 'pointer';
    advToggle.style.fontSize = '12px';
    advToggle.style.color = 'var(--vscode-textLink-foreground)';
    advToggle.style.marginTop = '8px';
    advToggle.style.userSelect = 'none';

    var advContent = document.createElement('div');
    advContent.className = 'advanced-section';
    advContent.style.display = 'none';
    advContent.style.marginTop = '8px';

    advToggle.addEventListener('click', function() {
      if (advContent.style.display === 'none') {
        advContent.style.display = 'block';
        advToggle.textContent = '▼ Advanced';
      } else {
        advContent.style.display = 'none';
        advToggle.textContent = '▶ Advanced';
      }
    });

    // Format
    var advFormatLabel = document.createElement('label');
    advFormatLabel.textContent = 'Format';
    var advFormatSelect = document.createElement('select');
    advFormatSelect.className = 'server-input';
    var updateFormatOptions = function() {
      var formatOptions = { string: ['', 'date', 'date-time', 'email', 'uri', 'uuid', 'hostname', 'ipv4', 'ipv6', 'byte', 'binary', 'password'], integer: ['', 'int32', 'int64'], number: ['', 'float', 'double'] };
      var opts = formatOptions[typeSelect.value] || [''];
      advFormatSelect.innerHTML = '';
      opts.forEach(function(f) {
        var opt = document.createElement('option');
        opt.value = f;
        opt.textContent = f || '(none)';
        advFormatSelect.appendChild(opt);
      });
    };
    updateFormatOptions();
    typeSelect.addEventListener('change', updateFormatOptions);

    // Example
    var advExampleLabel = document.createElement('label');
    advExampleLabel.textContent = 'Example';
    var advExampleInput = document.createElement('input');
    advExampleInput.type = 'text';
    advExampleInput.className = 'server-input';
    advExampleInput.placeholder = 'Example value';

    // Default
    var advDefaultLabel = document.createElement('label');
    advDefaultLabel.textContent = 'Default';
    var advDefaultInput = document.createElement('input');
    advDefaultInput.type = 'text';
    advDefaultInput.className = 'server-input';
    advDefaultInput.placeholder = 'Default value';

    // Enum
    var advEnumLabel = document.createElement('label');
    advEnumLabel.textContent = 'Enum (comma-separated)';
    var advEnumInput = document.createElement('input');
    advEnumInput.type = 'text';
    advEnumInput.className = 'server-input';
    advEnumInput.placeholder = 'e.g. active, inactive, pending';

    // Pattern
    var advPatternLabel = document.createElement('label');
    advPatternLabel.textContent = 'Pattern';
    var advPatternInput = document.createElement('input');
    advPatternInput.type = 'text';
    advPatternInput.className = 'server-input';
    advPatternInput.placeholder = 'e.g. ^[a-zA-Z]+$';

    // Min/Max Length
    var advMinLenLabel = document.createElement('label');
    advMinLenLabel.textContent = 'Min Length';
    var advMinLenInput = document.createElement('input');
    advMinLenInput.type = 'number';
    advMinLenInput.className = 'server-input';

    var advMaxLenLabel = document.createElement('label');
    advMaxLenLabel.textContent = 'Max Length';
    var advMaxLenInput = document.createElement('input');
    advMaxLenInput.type = 'number';
    advMaxLenInput.className = 'server-input';

    // Min/Max
    var advMinLabel = document.createElement('label');
    advMinLabel.textContent = 'Minimum';
    var advMinInput = document.createElement('input');
    advMinInput.type = 'number';
    advMinInput.className = 'server-input';

    var advMaxLabel = document.createElement('label');
    advMaxLabel.textContent = 'Maximum';
    var advMaxInput = document.createElement('input');
    advMaxInput.type = 'number';
    advMaxInput.className = 'server-input';

    // Flags
    var advFlagsDiv = document.createElement('div');
    advFlagsDiv.className = 'detail-checkbox-group';
    advFlagsDiv.style.marginTop = '8px';

    var advNullableLbl = document.createElement('label');
    var advNullableCb = document.createElement('input');
    advNullableCb.type = 'checkbox';
    advNullableLbl.appendChild(advNullableCb);
    advNullableLbl.appendChild(document.createTextNode(' Nullable'));

    var advDeprecatedLbl = document.createElement('label');
    var advDeprecatedCb = document.createElement('input');
    advDeprecatedCb.type = 'checkbox';
    advDeprecatedLbl.appendChild(advDeprecatedCb);
    advDeprecatedLbl.appendChild(document.createTextNode(' Deprecated'));

    var advReadOnlyLbl = document.createElement('label');
    var advReadOnlyCb = document.createElement('input');
    advReadOnlyCb.type = 'checkbox';
    advReadOnlyLbl.appendChild(advReadOnlyCb);
    advReadOnlyLbl.appendChild(document.createTextNode(' Read Only'));

    var advWriteOnlyLbl = document.createElement('label');
    var advWriteOnlyCb = document.createElement('input');
    advWriteOnlyCb.type = 'checkbox';
    advWriteOnlyLbl.appendChild(advWriteOnlyCb);
    advWriteOnlyLbl.appendChild(document.createTextNode(' Write Only'));

    advFlagsDiv.appendChild(advNullableLbl);
    advFlagsDiv.appendChild(advDeprecatedLbl);
    advFlagsDiv.appendChild(advReadOnlyLbl);
    advFlagsDiv.appendChild(advWriteOnlyLbl);

    advContent.appendChild(advFormatLabel);
    advContent.appendChild(advFormatSelect);
    advContent.appendChild(advExampleLabel);
    advContent.appendChild(advExampleInput);
    advContent.appendChild(advDefaultLabel);
    advContent.appendChild(advDefaultInput);
    advContent.appendChild(advEnumLabel);
    advContent.appendChild(advEnumInput);
    advContent.appendChild(advPatternLabel);
    advContent.appendChild(advPatternInput);
    advContent.appendChild(advMinLenLabel);
    advContent.appendChild(advMinLenInput);
    advContent.appendChild(advMaxLenLabel);
    advContent.appendChild(advMaxLenInput);
    advContent.appendChild(advMinLabel);
    advContent.appendChild(advMinInput);
    advContent.appendChild(advMaxLabel);
    advContent.appendChild(advMaxInput);
    advContent.appendChild(advFlagsDiv);

    form.appendChild(advToggle);
    form.appendChild(advContent);

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

      // Advanced fields
      var fmtVal = advFormatSelect.value;
      if (fmtVal) property.format = fmtVal;

      var exVal = advExampleInput.value.trim();
      if (exVal) {
        try { property.example = JSON.parse(exVal); } catch(e) { property.example = exVal; }
      }

      var defVal = advDefaultInput.value.trim();
      if (defVal) {
        try { property.default = JSON.parse(defVal); } catch(e) { property.default = defVal; }
      }

      var enumVal = advEnumInput.value.trim();
      if (enumVal) {
        property.enum = enumVal.split(',').map(function(v) { return v.trim(); }).filter(function(v) { return v; });
      }

      var patVal = advPatternInput.value.trim();
      if (patVal) property.pattern = patVal;

      var mlVal = advMinLenInput.value.trim();
      if (mlVal !== '') property.minLength = Number(mlVal);

      var xlVal = advMaxLenInput.value.trim();
      if (xlVal !== '') property.maxLength = Number(xlVal);

      var mnVal = advMinInput.value.trim();
      if (mnVal !== '') property.minimum = Number(mnVal);

      var mxVal = advMaxInput.value.trim();
      if (mxVal !== '') property.maximum = Number(mxVal);

      if (advNullableCb.checked) property.nullable = true;
      if (advDeprecatedCb.checked) property.deprecated = true;
      if (advReadOnlyCb.checked) property.readOnly = true;
      if (advWriteOnlyCb.checked) property.writeOnly = true;

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

  // Sort order for all "others" fields — used in tooltip, summary, and Edit Property dialog
  var FIELD_SORT_ORDER = {
    'format': 1, 'example': 2, 'default': 3,
    'enum': 10,
    'pattern': 20, 'minLength': 21, 'maxLength': 22,
    'minimum': 30, 'maximum': 31, 'exclusiveMinimum': 32, 'exclusiveMaximum': 33,
    'minItems': 40, 'maxItems': 41, 'uniqueItems': 42,
    'nullable': 50, 'deprecated': 51, 'readOnly': 52, 'writeOnly': 53
  };

  var SECTION_ORDER = {
    'General': 0, 'Enum': 1, 'String Constraints': 2,
    'Number Constraints': 3, 'Array Constraints': 4, 'Flags': 5
  };

  // Map field key to its section
  var FIELD_TO_SECTION = {
    'format': 'General', 'example': 'General', 'default': 'General',
    'enum': 'Enum',
    'pattern': 'String Constraints', 'minLength': 'String Constraints', 'maxLength': 'String Constraints',
    'minimum': 'Number Constraints', 'maximum': 'Number Constraints', 'exclusiveMinimum': 'Number Constraints', 'exclusiveMaximum': 'Number Constraints',
    'minItems': 'Array Constraints', 'maxItems': 'Array Constraints', 'uniqueItems': 'Array Constraints',
    'nullable': 'Flags', 'deprecated': 'Flags', 'readOnly': 'Flags', 'writeOnly': 'Flags'
  };

  // Collect all "others" fields from a property definition, sorted by FIELD_SORT_ORDER
  S.collectOthersFields = function(propDef) {
    var items = [];
    if (propDef.format) items.push({ key: 'format', value: propDef.format });
    if (propDef.example !== undefined) items.push({ key: 'example', value: typeof propDef.example === 'object' ? JSON.stringify(propDef.example) : String(propDef.example) });
    if (propDef.default !== undefined) items.push({ key: 'default', value: typeof propDef.default === 'object' ? JSON.stringify(propDef.default) : String(propDef.default) });
    if (propDef.enum && propDef.enum.length > 0) items.push({ key: 'enum', value: '[' + propDef.enum.join(', ') + ']' });
    if (propDef.pattern) items.push({ key: 'pattern', value: propDef.pattern });
    if (propDef.minLength !== undefined) items.push({ key: 'minLength', value: String(propDef.minLength) });
    if (propDef.maxLength !== undefined) items.push({ key: 'maxLength', value: String(propDef.maxLength) });
    if (propDef.minimum !== undefined) items.push({ key: 'minimum', value: String(propDef.minimum) });
    if (propDef.maximum !== undefined) items.push({ key: 'maximum', value: String(propDef.maximum) });
    if (propDef.exclusiveMinimum !== undefined) items.push({ key: 'exclusiveMinimum', value: String(propDef.exclusiveMinimum) });
    if (propDef.exclusiveMaximum !== undefined) items.push({ key: 'exclusiveMaximum', value: String(propDef.exclusiveMaximum) });
    if (propDef.minItems !== undefined) items.push({ key: 'minItems', value: String(propDef.minItems) });
    if (propDef.maxItems !== undefined) items.push({ key: 'maxItems', value: String(propDef.maxItems) });
    if (propDef.uniqueItems) items.push({ key: 'uniqueItems', value: 'true' });
    if (propDef.nullable) items.push({ key: 'nullable', value: 'true' });
    if (propDef.deprecated) items.push({ key: 'deprecated', value: 'true' });
    if (propDef.readOnly) items.push({ key: 'readOnly', value: 'true' });
    if (propDef.writeOnly) items.push({ key: 'writeOnly', value: 'true' });
    items.sort(function(a, b) {
      return (FIELD_SORT_ORDER[a.key] || 999) - (FIELD_SORT_ORDER[b.key] || 999);
    });
    return items;
  };

  S.getOthersDetails = function(propDef) {
    return S.collectOthersFields(propDef);
  };

  // Short label map for summary display
  var SUMMARY_LABELS = {
    'format': 'format', 'example': 'example', 'default': 'default',
    'enum': 'enum', 'pattern': 'pattern',
    'minLength': 'minLen', 'maxLength': 'maxLen',
    'minimum': 'min', 'maximum': 'max',
    'exclusiveMinimum': 'exclMin', 'exclusiveMaximum': 'exclMax',
    'minItems': 'minItems', 'maxItems': 'maxItems'
  };

  S.getOthersSummary = function(propDef) {
    var items = S.collectOthersFields(propDef);
    if (items.length === 0) return '—';
    var parts = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var label = SUMMARY_LABELS[item.key];
      if (label) {
        var val = item.value;
        if (item.key === 'enum') {
          val = item.value;
          if (val.length > 22) val = val.substring(0, 20) + '…]';
        } else if (val.length > 15) {
          val = val.substring(0, 15) + '…';
        }
        parts.push(label + ': ' + val);
      } else {
        // Boolean flags (uniqueItems, nullable, etc.)
        parts.push(item.key);
      }
    }
    var result = parts.join(', ');
    if (result.length > 50) result = result.substring(0, 50) + '…';
    return result;
  };

  S.showPropertyDetailDialog = function(schemaName, propName, propDef, onSave) {
    var existingDialog = document.querySelector('.server-dialog-overlay');
    if (existingDialog) existingDialog.remove();

    var overlay = document.createElement('div');
    overlay.className = 'server-dialog-overlay';

    var dialog = document.createElement('div');
    dialog.className = 'server-dialog property-detail-dialog';

    var title = document.createElement('h3');
    title.textContent = 'Edit Property: ' + propName;

    // Track inputs for save handler
    var inputs = {};

    // Track deleted fields so save handler can explicitly null them
    var deletedFields = {};

    // Track which sections exist so we can add fields to existing sections
    var sectionRows = {};

    // Build table
    var table = document.createElement('table');
    table.className = 'detail-table';

    var thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Field</th><th>Value</th><th></th></tr>';
    table.appendChild(thead);

    var tbody = document.createElement('tbody');

    // Helper: find the correct insertion point for a row based on sort order
    var findInsertionPoint = function(fieldKey) {
      var sortId = FIELD_SORT_ORDER[fieldKey] || 999;
      var rows = tbody.querySelectorAll('tr[data-field-key]');
      for (var i = 0; i < rows.length; i++) {
        var existingKey = rows[i].getAttribute('data-field-key');
        var existingSortId = FIELD_SORT_ORDER[existingKey] || 999;
        if (existingSortId > sortId) {
          // Also check if there's a section row right before this row
          var prev = rows[i].previousElementSibling;
          if (prev && prev.classList.contains('detail-section-row')) {
            // Check if this section row belongs to the same section as the field being inserted
            var fieldSection = FIELD_TO_SECTION[fieldKey];
            var existingSection = FIELD_TO_SECTION[existingKey];
            if (fieldSection !== existingSection) {
              return prev;
            }
          }
          return rows[i];
        }
      }
      return null;
    };

    // Helper: find the correct insertion point for a section header row
    var findSectionInsertionPoint = function(sectionLabel) {
      var sectionOrder = SECTION_ORDER[sectionLabel] !== undefined ? SECTION_ORDER[sectionLabel] : 999;
      // Find the first section row or field row that belongs to a later section
      var rows = tbody.children;
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (row.classList.contains('detail-section-row')) {
          var text = row.textContent;
          var existingOrder = SECTION_ORDER[text] !== undefined ? SECTION_ORDER[text] : 999;
          if (existingOrder > sectionOrder) return row;
        } else if (row.hasAttribute('data-field-key')) {
          var key = row.getAttribute('data-field-key');
          var fieldSection = FIELD_TO_SECTION[key];
          var fieldSectionOrder = SECTION_ORDER[fieldSection] !== undefined ? SECTION_ORDER[fieldSection] : 999;
          if (fieldSectionOrder > sectionOrder) return row;
        }
      }
      return null;
    };

    // Helper: remove empty section rows (sections with no field rows after them)
    var cleanupEmptySections = function() {
      for (var sectionLabel in sectionRows) {
        var sectionTr = sectionRows[sectionLabel];
        if (!sectionTr.parentNode) {
          delete sectionRows[sectionLabel];
          continue;
        }
        // Check if there are any field rows belonging to this section after the section header
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

    // Helper: add a section header row at the correct sorted position
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

    // Helper: add a field row with text/number/textarea input at the correct sorted position
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

    // Helper: add a switch toggle field row at the correct sorted position
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
    // Define all available fields grouped by section
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

    // Get fields that are not yet added
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
            // Ensure the section exists in the table
            if (!sectionRows[item.section]) {
              addSectionRow(item.section);
            }

            // Add the field row
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

            // Remove from deleted tracking if re-added
            delete deletedFields[item.field.key];

            addFieldDropdown.style.display = 'none';
            updateAddFieldBtn();

            // Focus the newly added input
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
        // Reset positioning
        addFieldDropdown.style.top = '';
        addFieldDropdown.style.bottom = '';
        addFieldDropdown.style.marginTop = '';
        addFieldDropdown.style.marginBottom = '';
        addFieldDropdown.style.display = 'block';

        // Measure and decide direction
        var btnRect = addFieldBtn.getBoundingClientRect();
        var dialogEl = dialog;
        var dialogRect = dialogEl.getBoundingClientRect();
        var dropdownHeight = addFieldDropdown.offsetHeight;
        var spaceBelow = dialogRect.bottom - btnRect.bottom - 16;
        var spaceAbove = btnRect.top - dialogRect.top - 16;

        if (spaceBelow >= dropdownHeight) {
          // Open downward
          addFieldDropdown.style.top = '100%';
          addFieldDropdown.style.bottom = 'auto';
          addFieldDropdown.style.marginTop = '4px';
          addFieldDropdown.style.marginBottom = '0';
        } else if (spaceAbove >= dropdownHeight) {
          // Open upward
          addFieldDropdown.style.top = 'auto';
          addFieldDropdown.style.bottom = '100%';
          addFieldDropdown.style.marginTop = '0';
          addFieldDropdown.style.marginBottom = '4px';
        } else {
          // Not enough space either way — open in direction with more room
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

    // Close dropdown when clicking elsewhere
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
      var updates = {};

      if (inputs.format) {
        var fv = inputs.format.value.trim();
        updates.format = fv || null;
      }
      if (inputs.example) {
        var ev = inputs.example.value.trim();
        if (ev) { try { updates.example = JSON.parse(ev); } catch(e) { updates.example = ev; } }
        else { updates.example = null; }
      }
      if (inputs.default) {
        var dv = inputs.default.value.trim();
        if (dv) { try { updates.default = JSON.parse(dv); } catch(e) { updates.default = dv; } }
        else { updates.default = null; }
      }
      if (inputs.enum) {
        var enumVal = inputs.enum.value.trim();
        if (enumVal) { updates.enum = enumVal.split(',').map(function(v) { return v.trim(); }).filter(function(v) { return v; }); }
        else { updates.enum = null; }
      }
      if (inputs.pattern) { var pv = inputs.pattern.value.trim(); updates.pattern = pv || null; }

      var numFields = ['minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minItems', 'maxItems'];
      numFields.forEach(function(f) {
        if (inputs[f]) {
          var v = inputs[f].value.trim();
          updates[f] = v !== '' ? Number(v) : null;
        }
      });

      var boolFields = ['uniqueItems', 'nullable', 'deprecated', 'readOnly', 'writeOnly'];
      boolFields.forEach(function(f) {
        if (inputs[f]) { updates[f] = inputs[f].checked ? true : null; }
      });

      // Explicitly null out any fields that were deleted in the dialog
      for (var dk in deletedFields) {
        if (!(dk in updates)) {
          updates[dk] = null;
        }
      }

      // If onSave callback provided, use it (for SchemaTable integration)
      if (typeof onSave === 'function') {
        // Build updated propDef by merging updates into existing propDef
        var updatedPropDef = Object.assign({}, propDef);
        for (var key in updates) {
          if (updates[key] === null) {
            delete updatedPropDef[key];
          } else {
            updatedPropDef[key] = updates[key];
          }
        }
        onSave(updatedPropDef);
      } else {
        // Legacy behavior: send postMessage
        S.vscode.postMessage({
          type: 'updateSchemaProperty',
          payload: { filePath: S.currentFilePath, schemaName: schemaName, propertyName: propName, updates: updates }
        });
      }
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

  // Create visual layout for non-object schema types (string, integer, number, boolean, array)
  function createNonObjectSchemaVisual(schemaName, schema) {
    var escapeHtml = S.escapeHtml;
    var container = document.createElement('div');
    var currentSchema = Object.assign({}, schema);
    var currentType = schema.type || 'string';
    var rowElements = {}; // track rendered rows by key

    var table = document.createElement('table');
    table.className = 'param-detail-table';
    var tbody = document.createElement('tbody');

    // Save current schema state to extension and update local data
    function saveSchema() {
      // Update local data so Source tab reflects changes immediately
      if (S.currentComponents && S.currentComponents.schemas) {
        S.currentComponents.schemas[schemaName] = Object.assign({}, currentSchema);
      }
      S.vscode.postMessage({
        type: 'updateFullSchema',
        payload: { filePath: S.currentFilePath, schemaName: schemaName, schema: currentSchema }
      });
    }

    // Remove a row from the table and schema
    function removeRow(key, tr) {
      delete currentSchema[key];
      delete rowElements[key];
      tr.remove();
      saveSchema();
      updateAddFieldBtn();
    }

    // Add a row to the table for a given field definition
    function addRow(fieldDef, value) {
      var key = fieldDef.key;
      var tr = document.createElement('tr');
      tr.setAttribute('data-field-key', key);

      var labelTd = document.createElement('td');
      labelTd.innerHTML = '<strong>' + escapeHtml(fieldDef.label) + '</strong>';

      var valueTd = document.createElement('td');
      valueTd.className = 'editable-cell';

      if (fieldDef.inputType === 'toggle') {
        var switchLabel = document.createElement('label');
        switchLabel.className = 'switch-toggle';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!value;
        cb.addEventListener('change', function() {
          currentSchema[key] = cb.checked ? true : undefined;
          if (!cb.checked) delete currentSchema[key];
          else currentSchema[key] = true;
          saveSchema();
        });
        var slider = document.createElement('span');
        slider.className = 'switch-slider';
        switchLabel.appendChild(cb);
        switchLabel.appendChild(slider);
        valueTd.appendChild(switchLabel);
      } else if (fieldDef.inputType === 'select') {
        var span = document.createElement('span');
        span.className = 'editable-cell-value';
        span.textContent = value || '—';
        valueTd.appendChild(span);
        valueTd.addEventListener('click', function() {
          if (valueTd.querySelector('select')) return;
          var select = document.createElement('select');
          select.className = 'inline-edit-select';
          var options = fieldDef.options || [];
          options.forEach(function(opt) {
            var option = document.createElement('option');
            option.value = opt;
            option.textContent = opt || '(none)';
            if (opt === (value || '')) option.selected = true;
            select.appendChild(option);
          });
          valueTd.innerHTML = '';
          valueTd.appendChild(select);
          select.focus();

          function save() {
            var newVal = select.value;
            if (newVal) {
              currentSchema[key] = newVal;
            } else {
              delete currentSchema[key];
            }
            span.textContent = newVal || '—';
            valueTd.innerHTML = '';
            valueTd.appendChild(span);
            value = newVal;
            saveSchema();
          }
          select.addEventListener('blur', save);
          select.addEventListener('change', save);
        });
      } else {
        // text or number
        var span = document.createElement('span');
        span.className = 'editable-cell-value';
        span.textContent = (value !== undefined && value !== null && value !== '') ? String(value) : '—';
        valueTd.appendChild(span);
        valueTd.addEventListener('click', function() {
          if (valueTd.querySelector('input')) return;
          var input = document.createElement('input');
          input.type = fieldDef.inputType === 'number' ? 'number' : 'text';
          input.className = 'inline-edit-input';
          input.value = (value !== undefined && value !== null) ? String(value) : '';
          if (fieldDef.placeholder) input.placeholder = fieldDef.placeholder;
          valueTd.innerHTML = '';
          valueTd.appendChild(input);
          input.focus();
          input.select();

          function save() {
            var newVal = input.value.trim();
            // Update schema
            if (key === 'enum') {
              if (newVal) {
                currentSchema.enum = newVal.split(',').map(function(v) { return v.trim(); }).filter(function(v) { return v; });
              } else {
                delete currentSchema.enum;
              }
            } else if (key === 'example' || key === 'default') {
              if (newVal) {
                try { currentSchema[key] = JSON.parse(newVal); } catch(e) { currentSchema[key] = newVal; }
              } else {
                delete currentSchema[key];
              }
            } else if (fieldDef.inputType === 'number') {
              if (newVal !== '') {
                currentSchema[key] = Number(newVal);
              } else {
                delete currentSchema[key];
              }
            } else {
              if (newVal) {
                currentSchema[key] = newVal;
              } else {
                delete currentSchema[key];
              }
            }
            value = newVal;
            span.textContent = newVal || '—';
            valueTd.innerHTML = '';
            valueTd.appendChild(span);
            saveSchema();
          }
          input.addEventListener('blur', save);
          input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); save(); }
            else if (e.key === 'Escape') {
              valueTd.innerHTML = '';
              valueTd.appendChild(span);
            }
          });
        });
      }

      tr.appendChild(labelTd);
      tr.appendChild(valueTd);

      // Delete button (not for 'type' row — type is always shown)
      var deleteTd = document.createElement('td');
      deleteTd.className = 'detail-field-delete';
      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'detail-field-delete-btn';
      deleteBtn.textContent = '✕';
      deleteBtn.title = 'Remove field';
      deleteBtn.addEventListener('click', function() {
        removeRow(key, tr);
      });
      deleteTd.appendChild(deleteBtn);
      tr.appendChild(deleteTd);

      tbody.appendChild(tr);
      rowElements[key] = tr;
      return tr;
    }

    // Type row (always shown, no delete button)
    (function() {
      var tr = document.createElement('tr');
      var labelTd = document.createElement('td');
      labelTd.innerHTML = '<strong>Type</strong>';
      var valueTd = document.createElement('td');
      valueTd.className = 'editable-cell';

      var span = document.createElement('span');
      span.className = 'editable-cell-value';
      span.textContent = currentType;
      valueTd.appendChild(span);
      valueTd.addEventListener('click', function() {
        if (valueTd.querySelector('select')) return;
        var select = document.createElement('select');
        select.className = 'inline-edit-select';
        ['string', 'integer', 'number', 'boolean', 'array'].forEach(function(t) {
          var opt = document.createElement('option');
          opt.value = t;
          opt.textContent = t;
          if (t === currentType) opt.selected = true;
          select.appendChild(opt);
        });
        valueTd.innerHTML = '';
        valueTd.appendChild(select);
        select.focus();

        function save() {
          var newType = select.value;
          if (newType !== currentType) {
            // Remove fields not valid for new type
            var newFields = getFieldsForType(newType);
            var newFieldKeys = newFields.map(function(f) { return f.key; });
            for (var rKey in rowElements) {
              if (newFieldKeys.indexOf(rKey) === -1) {
                delete currentSchema[rKey];
                rowElements[rKey].remove();
                delete rowElements[rKey];
              }
            }
            currentType = newType;
            currentSchema.type = newType;
          }
          span.textContent = newType;
          valueTd.innerHTML = '';
          valueTd.appendChild(span);
          saveSchema();
          updateAddFieldBtn();
        }
        select.addEventListener('blur', save);
        select.addEventListener('change', save);
      });

      tr.appendChild(labelTd);
      tr.appendChild(valueTd);
      // Empty cell for alignment with delete column
      var emptyTd = document.createElement('td');
      tr.appendChild(emptyTd);
      tbody.appendChild(tr);
    })();

    // Render existing fields
    var allFields = getFieldsForType(currentType);
    allFields.forEach(function(fieldDef) {
      if (schemaHasField(schema, fieldDef.key)) {
        var value = getSchemaFieldValue(schema, fieldDef.key);
        addRow(fieldDef, value);
      }
    });

    table.appendChild(tbody);
    container.appendChild(table);

    // Add Field button + dialog
    var addFieldContainer = document.createElement('div');
    addFieldContainer.className = 'add-field-container';
    addFieldContainer.style.marginTop = '8px';

    var addFieldBtn = document.createElement('button');
    addFieldBtn.className = 'add-field-btn';
    addFieldBtn.textContent = '+ Add Field';

    function updateAddFieldBtn() {
      var available = getAvailableFields();
      addFieldBtn.style.display = available.length === 0 ? 'none' : '';
    }

    function getAvailableFields() {
      var fields = getFieldsForType(currentType);
      return fields.filter(function(f) { return !rowElements[f.key]; });
    }

  function showAddFieldDialog() {
    var existingDialog = document.querySelector('.server-dialog-overlay');
    if (existingDialog) existingDialog.remove();

    var available = getAvailableFields();
    if (available.length === 0) return;

    var overlay = document.createElement('div');
    overlay.className = 'server-dialog-overlay';

    var dialog = document.createElement('div');
    dialog.className = 'server-dialog server-dialog-sm';

    var title = document.createElement('h3');
    title.textContent = 'Add Field';

    var form = document.createElement('div');
    form.className = 'server-form';

    // Group available fields by section
    var fieldsBySection = {};
    available.forEach(function(fieldDef) {
      var section = FIELD_TO_SECTION[fieldDef.key] || 'General';
      if (!fieldsBySection[section]) {
        fieldsBySection[section] = [];
      }
      fieldsBySection[section].push(fieldDef);
    });

    // Field dropdown with sections
    var fieldLabel = document.createElement('label');
    fieldLabel.textContent = 'Field *';
    
    var fieldDropdownContainer = document.createElement('div');
    fieldDropdownContainer.className = 'add-field-container';
    fieldDropdownContainer.style.position = 'relative';
    
    var fieldSelectBtn = document.createElement('button');
    fieldSelectBtn.type = 'button';
    fieldSelectBtn.className = 'server-input';
    fieldSelectBtn.style.textAlign = 'left';
    fieldSelectBtn.style.cursor = 'pointer';
    fieldSelectBtn.textContent = 'Select a field...';
    
    var fieldDropdown = document.createElement('div');
    fieldDropdown.className = 'add-field-dropdown';
    fieldDropdown.style.display = 'none';
    fieldDropdown.style.position = 'absolute';
    fieldDropdown.style.top = '100%';
    fieldDropdown.style.left = '0';
    fieldDropdown.style.right = '0';
    fieldDropdown.style.zIndex = '1000';
    fieldDropdown.style.marginTop = '4px';
    
    var selectedFieldDef = null;
    
    // Render grouped dropdown
    var sectionOrder = ['General', 'Enum', 'String Constraints', 'Number Constraints', 'Array Constraints', 'Flags'];
    sectionOrder.forEach(function(section) {
      if (!fieldsBySection[section] || fieldsBySection[section].length === 0) return;
      
      var sectionHeader = document.createElement('div');
      sectionHeader.className = 'add-field-dropdown-section';
      sectionHeader.textContent = section;
      fieldDropdown.appendChild(sectionHeader);
      
      fieldsBySection[section].forEach(function(fieldDef) {
        var option = document.createElement('div');
        option.className = 'add-field-dropdown-item';
        option.textContent = fieldDef.label;
        option.addEventListener('click', function() {
          selectedFieldDef = fieldDef;
          fieldSelectBtn.textContent = fieldDef.label;
          fieldDropdown.style.display = 'none';
          renderValueInput();
        });
        fieldDropdown.appendChild(option);
      });
    });
    
    fieldSelectBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      fieldDropdown.style.display = fieldDropdown.style.display === 'none' ? 'block' : 'none';
    });
    
    fieldDropdownContainer.appendChild(fieldSelectBtn);
    fieldDropdownContainer.appendChild(fieldDropdown);

    form.appendChild(fieldLabel);
    form.appendChild(fieldDropdownContainer);

    // Value input area — changes based on selected field
    var valueLabel = document.createElement('label');
    valueLabel.textContent = 'Value';
    var valueContainer = document.createElement('div');
    valueContainer.style.minHeight = '38px';

    var currentValueInput = null;

    function renderValueInput() {
      valueContainer.innerHTML = '';
      if (!selectedFieldDef) return;
      var fieldDef = selectedFieldDef;

      if (fieldDef.inputType === 'toggle') {
        // Checkbox for boolean fields
        var checkLabel = document.createElement('label');
        checkLabel.className = 'schema-checkbox-label';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        checkLabel.appendChild(cb);
        checkLabel.appendChild(document.createTextNode(' ' + fieldDef.label));
        valueContainer.appendChild(checkLabel);
        currentValueInput = cb;
        valueLabel.textContent = 'Value';
      } else if (fieldDef.inputType === 'select') {
        // Select dropdown for format fields
        var sel = document.createElement('select');
        sel.className = 'server-input';
        (fieldDef.options || []).forEach(function(optVal) {
          var opt = document.createElement('option');
          opt.value = optVal;
          opt.textContent = optVal || '(none)';
          sel.appendChild(opt);
        });
        valueContainer.appendChild(sel);
        currentValueInput = sel;
        valueLabel.textContent = 'Value';
      } else if (fieldDef.inputType === 'number') {
        var numInput = document.createElement('input');
        numInput.type = 'number';
        numInput.className = 'server-input';
        if (fieldDef.placeholder) numInput.placeholder = fieldDef.placeholder;
        valueContainer.appendChild(numInput);
        currentValueInput = numInput;
        valueLabel.textContent = 'Value';
      } else {
        // Text input
        var textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.className = 'server-input';
        if (fieldDef.placeholder) textInput.placeholder = fieldDef.placeholder;
        valueContainer.appendChild(textInput);
        currentValueInput = textInput;
        valueLabel.textContent = 'Value';
      }
    }

    form.appendChild(valueLabel);
    form.appendChild(valueContainer);

    // Buttons
    var buttons = document.createElement('div');
    buttons.className = 'server-dialog-buttons';

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'server-dialog-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', function() { overlay.remove(); });

    var addBtn = document.createElement('button');
    addBtn.className = 'server-dialog-save';
    addBtn.textContent = 'Add';
    addBtn.addEventListener('click', function() {
      if (!selectedFieldDef) return;
      var fieldDef = selectedFieldDef;

      var key = fieldDef.key;
      var value;

      if (fieldDef.inputType === 'toggle') {
        value = currentValueInput.checked;
        currentSchema[key] = value ? true : false;
      } else if (fieldDef.inputType === 'select') {
        value = currentValueInput.value;
        if (value) {
          currentSchema[key] = value;
        } else {
          currentSchema[key] = '';
        }
      } else if (key === 'enum') {
        var rawVal = currentValueInput.value.trim();
        if (rawVal) {
          currentSchema.enum = rawVal.split(',').map(function(v) { return v.trim(); }).filter(function(v) { return v; });
          value = rawVal;
        } else {
          currentSchema.enum = [];
          value = '';
        }
      } else if (key === 'example' || key === 'default') {
        var rawVal = currentValueInput.value.trim();
        if (rawVal) {
          try { currentSchema[key] = JSON.parse(rawVal); } catch(e) { currentSchema[key] = rawVal; }
        } else {
          currentSchema[key] = '';
        }
        value = rawVal;
      } else if (fieldDef.inputType === 'number') {
        var numVal = currentValueInput.value.trim();
        if (numVal !== '') {
          currentSchema[key] = Number(numVal);
          value = Number(numVal);
        } else {
          currentSchema[key] = 0;
          value = 0;
        }
      } else {
        value = currentValueInput.value.trim();
        currentSchema[key] = value || '';
      }

      // Add the row to the table
      addRow(fieldDef, value);
      saveSchema();
      updateAddFieldBtn();
      overlay.remove();
    });

    buttons.appendChild(cancelBtn);
    buttons.appendChild(addBtn);
    dialog.appendChild(title);
    dialog.appendChild(form);
    dialog.appendChild(buttons);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Close dropdown when clicking elsewhere
    dialog.addEventListener('click', function(e) {
      if (!fieldDropdownContainer.contains(e.target)) {
        fieldDropdown.style.display = 'none';
      }
    });

    // Keyboard handling
    overlay.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') overlay.remove();
      else if (e.key === 'Enter' && selectedFieldDef) addBtn.click();
    });

    fieldSelectBtn.focus();
  }

    addFieldBtn.addEventListener('click', function() {
      showAddFieldDialog();
    });

    addFieldContainer.appendChild(addFieldBtn);
    container.appendChild(addFieldContainer);

    updateAddFieldBtn();

    return container;
  }

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
        S.showConfirmDialog('Are you sure you want to delete schema <code>' + name + '</code>?', function() {
          S.vscode.postMessage({
            type: 'deleteSchema',
            payload: { filePath: S.currentFilePath, schemaName: name }
          });
        });
      });

      var isObject = isObjectSchema(schema);

      // Only show "+ Property" for object schemas
      if (isObject) {
        headerActions.appendChild(addPropBtn);
      }
      headerActions.appendChild(deleteSchemaBtn);

      header.appendChild(nameSpan);
      header.appendChild(typeSpan);
      header.appendChild(headerActions);
      card.appendChild(header);

      // Schema card tabs (Properties/Visual / Source)
      var schemaTabBar = document.createElement('div');
      schemaTabBar.className = 'schema-card-tabs';

      var propsTabBtn = document.createElement('button');
      propsTabBtn.className = 'schema-card-tab-btn active';
      propsTabBtn.textContent = isObject ? 'Properties' : 'Visual';

      var sourceTabBtn = document.createElement('button');
      sourceTabBtn.className = 'schema-card-tab-btn';
      sourceTabBtn.textContent = 'Source';

      schemaTabBar.appendChild(propsTabBtn);
      schemaTabBar.appendChild(sourceTabBtn);
      card.appendChild(schemaTabBar);

      // Properties tab content
      var propsContent = document.createElement('div');
      propsContent.className = 'schema-card-tab-content active';

      // Source tab content
      var sourceContent = document.createElement('div');
      sourceContent.className = 'schema-card-tab-content';

      var sourceWrapper = document.createElement('div');
      sourceWrapper.className = 'schema-source-wrapper';

      var sourcePre = document.createElement('pre');
      sourcePre.className = 'schema-source-pre';
      var sourceCode = document.createElement('code');
      sourceCode.className = 'schema-source-code';
      sourceCode.innerHTML = S.highlightJson(JSON.stringify(schema, null, 2));
      sourcePre.appendChild(sourceCode);
      sourceWrapper.appendChild(sourcePre);
      sourceContent.appendChild(sourceWrapper);

      // Tab switching
      (function(propsBtn, srcBtn, propsCont, srcCont, schemaName, codeEl) {
        propsBtn.addEventListener('click', function() {
          propsBtn.classList.add('active');
          srcBtn.classList.remove('active');
          propsCont.classList.add('active');
          srcCont.classList.remove('active');
        });
        srcBtn.addEventListener('click', function() {
          srcBtn.classList.add('active');
          propsBtn.classList.remove('active');
          srcCont.classList.add('active');
          propsCont.classList.remove('active');
          // Refresh source from current data
          var currentSchema = (S.currentComponents.schemas || {})[schemaName];
          if (currentSchema) {
            codeEl.innerHTML = S.highlightJson(JSON.stringify(currentSchema, null, 2));
          }
        });
      })(propsTabBtn, sourceTabBtn, propsContent, sourceContent, name, sourceCode);

      if (isObject) {
        // Properties table - use reusable SchemaTable component
        (function(schemaName, schemaData, propsContainer) {
          // Add Save button (hidden initially)
          var saveRow = document.createElement('div');
          saveRow.className = 'schema-save-row';
          saveRow.style.display = 'none';
          var saveBtn = document.createElement('button');
          saveBtn.className = 'schema-save-btn';
          saveBtn.textContent = 'Save Schema';

          var schemaTableInstance = window.SchemaTable.create({
            container: propsContainer,
            schema: schemaData,
            onDirtyChange: function(isDirty) {
              saveRow.style.display = isDirty ? '' : 'none';
            },
            onShowOthersDialog: function(propName, propDef, onSave) {
              S.showPropertyDetailDialog(schemaName, propName, propDef, onSave);
            }
          });

          // Store reference for potential cleanup
          propsContainer._schemaTable = schemaTableInstance;

          saveBtn.addEventListener('click', function() {
            var newSchema = schemaTableInstance.getSchema();
            S.vscode.postMessage({
              type: 'updateFullSchema',
              payload: { filePath: S.currentFilePath, schemaName: schemaName, schema: newSchema }
            });
            schemaTableInstance.setClean();
          });
          saveRow.appendChild(saveBtn);
          propsContainer.appendChild(saveRow);
        })(name, schema, propsContent);
      } else {
        // Non-object schema: render key-value detail table
        var visualContent = createNonObjectSchemaVisual(name, schema);
        propsContent.appendChild(visualContent);
      }

      card.appendChild(propsContent);
      card.appendChild(sourceContent);
      container.appendChild(card);
    });
  };

  // --- Component Parameters ---

  var LOCATION_COLORS = {
    path: 'param-location-path',
    query: 'param-location-query',
    header: 'param-location-header',
    cookie: 'param-location-cookie'
  };

  S.renderEditableParameters = function() {
    var escapeHtml = S.escapeHtml;
    var container = document.getElementById('comp-params-editable-content');
    if (!container || !S.currentComponents) return;

    container.innerHTML = '';

    var parameters = S.currentComponents.parameters || {};
    var paramKeys = Object.keys(parameters);

    if (paramKeys.length === 0) {
      var emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.innerHTML = '<p>No parameters defined</p><p class="empty-state-hint">Click "+ Add Parameter" to create one</p>';
      container.appendChild(emptyState);
      return;
    }

    // Group by location
    var groups = { path: [], query: [], header: [], cookie: [] };
    paramKeys.forEach(function(key) {
      var param = parameters[key];
      var loc = param._paramIn || 'query';
      if (!groups[loc]) { groups[loc] = []; }
      groups[loc].push({ key: key, param: param });
    });

    var locationOrder = ['path', 'query', 'header', 'cookie'];
    locationOrder.forEach(function(loc) {
      var items = groups[loc];
      if (!items || items.length === 0) return;

      var section = document.createElement('section');
      section.className = 'section';

      var sectionHeader = document.createElement('h3');
      sectionHeader.className = 'section-header collapsible';
      sectionHeader.textContent = loc.charAt(0).toUpperCase() + loc.slice(1) + ' Parameters (' + items.length + ')';

      var sectionContent = document.createElement('div');
      sectionContent.className = 'section-content';

      sectionHeader.addEventListener('click', function() {
        sectionHeader.classList.toggle('collapsed');
        sectionContent.classList.toggle('hidden');
      });

      items.forEach(function(item) {
        var card = createParameterCard(item.key, item.param, escapeHtml);
        sectionContent.appendChild(card);
      });

      section.appendChild(sectionHeader);
      section.appendChild(sectionContent);
      container.appendChild(section);
    });
  };

  function createParameterCard(paramKey, param, escapeHtml) {
    var card = document.createElement('div');
    card.className = 'component-card';

    // Header
    var header = document.createElement('div');
    header.className = 'component-header';

    var nameSpan = document.createElement('span');
    nameSpan.className = 'component-name';
    nameSpan.textContent = paramKey;

    var locationBadge = document.createElement('span');
    locationBadge.className = 'component-type ' + (LOCATION_COLORS[param._paramIn] || '');
    locationBadge.textContent = param._paramIn || 'query';

    var typeBadge = document.createElement('span');
    typeBadge.className = 'component-type';
    typeBadge.textContent = param.type || 'string';

    var headerActions = document.createElement('div');
    headerActions.className = 'schema-header-actions';

    var deleteBtn = document.createElement('button');
    deleteBtn.className = 'schema-action-btn delete';
    deleteBtn.textContent = 'Delete';
    deleteBtn.title = 'Delete parameter';
    deleteBtn.addEventListener('click', function() {
      S.showConfirmDialog('Are you sure you want to delete parameter <code>' + escapeHtml(paramKey) + '</code>?', function() {
        S.vscode.postMessage({
          type: 'deleteComponentParameter',
          payload: { filePath: S.currentFilePath, paramKey: paramKey }
        });
      });
    });

    headerActions.appendChild(deleteBtn);
    header.appendChild(nameSpan);
    header.appendChild(locationBadge);
    header.appendChild(typeBadge);
    header.appendChild(headerActions);
    card.appendChild(header);

    // Card tabs (Visual / Source)
    var tabBar = document.createElement('div');
    tabBar.className = 'schema-card-tabs';

    var visualTabBtn = document.createElement('button');
    visualTabBtn.className = 'schema-card-tab-btn active';
    visualTabBtn.textContent = 'Visual';

    var sourceTabBtn = document.createElement('button');
    sourceTabBtn.className = 'schema-card-tab-btn';
    sourceTabBtn.textContent = 'Source';

    tabBar.appendChild(visualTabBtn);
    tabBar.appendChild(sourceTabBtn);
    card.appendChild(tabBar);

    // Visual tab content
    var visualContent = document.createElement('div');
    visualContent.className = 'schema-card-tab-content active';

    var table = document.createElement('table');
    table.className = 'param-detail-table';

    var tbody = document.createElement('tbody');

    // Helper: create editable row
    function addRow(label, value, field, inputType) {
      var tr = document.createElement('tr');

      var labelTd = document.createElement('td');
      labelTd.innerHTML = '<strong>' + escapeHtml(label) + '</strong>';

      var valueTd = document.createElement('td');
      valueTd.className = 'editable-cell';

      if (inputType === 'toggle') {
        var switchLabel = document.createElement('label');
        switchLabel.className = 'switch-toggle';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!value;
        cb.addEventListener('change', function() {
          var updates = {};
          updates[field] = cb.checked ? true : null;
          S.vscode.postMessage({
            type: 'updateComponentParameter',
            payload: { filePath: S.currentFilePath, paramKey: paramKey, updates: updates }
          });
        });
        var slider = document.createElement('span');
        slider.className = 'switch-slider';
        switchLabel.appendChild(cb);
        switchLabel.appendChild(slider);
        valueTd.appendChild(switchLabel);
      } else if (inputType === 'select') {
        var span = document.createElement('span');
        span.className = 'editable-cell-value';
        span.textContent = value || '—';
        valueTd.appendChild(span);
        valueTd.addEventListener('click', function() {
          if (valueTd.querySelector('select')) return;
          var select = document.createElement('select');
          select.className = 'inline-edit-select';
          var options = [];
          if (field === 'in') {
            options = ['path', 'query', 'header', 'cookie'];
          } else if (field === 'type') {
            options = ['string', 'integer', 'number', 'boolean', 'array'];
          }
          options.forEach(function(opt) {
            var option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            if (opt === value) option.selected = true;
            select.appendChild(option);
          });
          valueTd.innerHTML = '';
          valueTd.appendChild(select);
          select.focus();

          function save() {
            var newVal = select.value;
            if (newVal !== value) {
              var updates = {};
              updates[field] = newVal;
              S.vscode.postMessage({
                type: 'updateComponentParameter',
                payload: { filePath: S.currentFilePath, paramKey: paramKey, updates: updates }
              });
            }
            span.textContent = newVal || '—';
            valueTd.innerHTML = '';
            valueTd.appendChild(span);
          }
          select.addEventListener('blur', save);
          select.addEventListener('change', save);
        });
      } else {
        var span = document.createElement('span');
        span.className = 'editable-cell-value';
        span.textContent = value !== undefined && value !== null && value !== '' ? String(value) : '—';
        valueTd.appendChild(span);
        valueTd.addEventListener('click', function() {
          if (valueTd.querySelector('input')) return;
          var input = document.createElement('input');
          input.type = 'text';
          input.className = 'inline-edit-input';
          input.value = value !== undefined && value !== null ? String(value) : '';
          valueTd.innerHTML = '';
          valueTd.appendChild(input);
          input.focus();
          input.select();

          function save() {
            var newVal = input.value.trim();
            if (newVal !== (value !== undefined && value !== null ? String(value) : '')) {
              var updates = {};
              if (field === 'example') {
                try { updates[field] = JSON.parse(newVal); } catch(e) { updates[field] = newVal || null; }
              } else {
                updates[field] = newVal || null;
              }
              S.vscode.postMessage({
                type: 'updateComponentParameter',
                payload: { filePath: S.currentFilePath, paramKey: paramKey, updates: updates }
              });
            }
            span.textContent = newVal || '—';
            valueTd.innerHTML = '';
            valueTd.appendChild(span);
          }
          input.addEventListener('blur', save);
          input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); save(); }
            else if (e.key === 'Escape') {
              valueTd.innerHTML = '';
              valueTd.appendChild(span);
            }
          });
        });
      }

      tr.appendChild(labelTd);
      tr.appendChild(valueTd);
      tbody.appendChild(tr);
    }

    addRow('Name', param._paramName || '', 'name', 'text');
    addRow('Location', param._paramIn || 'query', 'in', 'select');
    addRow('Type', param.type || 'string', 'type', 'select');
    addRow('Required', param._paramRequired, 'required', 'toggle');
    addRow('Description', param.description || '', 'description', 'text');
    addRow('Deprecated', param.deprecated, 'deprecated', 'toggle');
    addRow('Example', param.example !== undefined ? (typeof param.example === 'object' ? JSON.stringify(param.example) : String(param.example)) : '', 'example', 'text');

    // Show schema constraints summary if any
    var othersItems = S.collectOthersFields(param);
    // Filter out fields already shown above
    var extraItems = othersItems.filter(function(item) {
      return ['format', 'enum', 'default', 'pattern', 'minLength', 'maxLength', 'minimum', 'maximum',
              'exclusiveMinimum', 'exclusiveMaximum', 'minItems', 'maxItems', 'uniqueItems', 'nullable'].indexOf(item.key) !== -1;
    });
    if (extraItems.length > 0) {
      var constraintsTr = document.createElement('tr');
      var constraintsLabelTd = document.createElement('td');
      constraintsLabelTd.innerHTML = '<strong>Constraints</strong>';
      var constraintsValueTd = document.createElement('td');
      constraintsValueTd.className = 'constraints-summary';
      constraintsValueTd.textContent = extraItems.map(function(item) { return item.key + ': ' + item.value; }).join(', ');
      constraintsTr.appendChild(constraintsLabelTd);
      constraintsTr.appendChild(constraintsValueTd);
      tbody.appendChild(constraintsTr);
    }

    table.appendChild(tbody);
    visualContent.appendChild(table);

    // Source tab content
    var sourceContent = document.createElement('div');
    sourceContent.className = 'schema-card-tab-content';

    var sourceWrapper = document.createElement('div');
    sourceWrapper.className = 'schema-source-wrapper';

    var sourcePre = document.createElement('pre');
    sourcePre.className = 'schema-source-pre';
    var sourceCode = document.createElement('code');
    sourceCode.className = 'schema-source-code';

    // Build the OpenAPI representation for source view
    var sourceObj = buildParameterSourceObj(param);
    sourceCode.innerHTML = S.highlightJson(JSON.stringify(sourceObj, null, 2));
    sourcePre.appendChild(sourceCode);
    sourceWrapper.appendChild(sourcePre);
    sourceContent.appendChild(sourceWrapper);

    // Tab switching
    (function(visBtn, srcBtn, visCont, srcCont, pKey, codeEl) {
      visBtn.addEventListener('click', function() {
        visBtn.classList.add('active');
        srcBtn.classList.remove('active');
        visCont.classList.add('active');
        srcCont.classList.remove('active');
      });
      srcBtn.addEventListener('click', function() {
        srcBtn.classList.add('active');
        visBtn.classList.remove('active');
        srcCont.classList.add('active');
        visCont.classList.remove('active');
        // Refresh source
        var currentParam = (S.currentComponents.parameters || {})[pKey];
        if (currentParam) {
          codeEl.innerHTML = S.highlightJson(JSON.stringify(buildParameterSourceObj(currentParam), null, 2));
        }
      });
    })(visualTabBtn, sourceTabBtn, visualContent, sourceContent, paramKey, sourceCode);

    card.appendChild(visualContent);
    card.appendChild(sourceContent);

    return card;
  }

  function buildParameterSourceObj(param) {
    var obj = {};
    if (param._paramName) obj.name = param._paramName;
    if (param._paramIn) obj.in = param._paramIn;
    if (param.description) obj.description = param.description;
    if (param._paramRequired) obj.required = true;
    if (param.deprecated) obj.deprecated = true;
    if (param.example !== undefined) obj.example = param.example;
    var schema = {};
    if (param.type) schema.type = param.type;
    if (param.format) schema.format = param.format;
    if (param.enum) schema.enum = param.enum;
    if (param.default !== undefined) schema.default = param.default;
    if (param.pattern) schema.pattern = param.pattern;
    if (param.minimum !== undefined) schema.minimum = param.minimum;
    if (param.maximum !== undefined) schema.maximum = param.maximum;
    if (param.minLength !== undefined) schema.minLength = param.minLength;
    if (param.maxLength !== undefined) schema.maxLength = param.maxLength;
    if (Object.keys(schema).length > 0) obj.schema = schema;
    return obj;
  }

  S.showComponentParameterDialog = function() {
    var existingDialog = document.querySelector('.server-dialog-overlay');
    if (existingDialog) existingDialog.remove();
    // Determine default location based on file type
    var defaultLocation = 'query';
    var isReadOnly = false;
    
    if (S.currentFileType === 'parameter') {
      // For parameter-only files, find the most common location
      var parameters = S.currentComponents.parameters || {};
      var locationCounts = {};
      Object.keys(parameters).forEach(function(key) {
        var loc = parameters[key]._paramIn || 'query';
        locationCounts[loc] = (locationCounts[loc] || 0) + 1;
      });
      
      // Find the most common location
      var maxCount = 0;
      Object.keys(locationCounts).forEach(function(loc) {
        if (locationCounts[loc] > maxCount) {
          maxCount = locationCounts[loc];
          defaultLocation = loc;
        }
      });
      
      isReadOnly = true;
    }

    var overlay = document.createElement('div');
    overlay.className = 'server-dialog-overlay';

    var dialog = document.createElement('div');
    dialog.className = 'server-dialog';

    var title = document.createElement('h3');
    title.textContent = 'Add Parameter';

    var form = document.createElement('div');
    form.className = 'server-form';

    // Key field
    var keyLabel = document.createElement('label');
    keyLabel.textContent = 'Key *';
    var keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = 'server-input';
    keyInput.placeholder = 'e.g., limitParam';

    // Name field
    var nameLabel = document.createElement('label');
    nameLabel.textContent = 'Name *';
    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'server-input';
    nameInput.placeholder = 'e.g., limit';

    // Location field
    var locLabel = document.createElement('label');
    locLabel.textContent = 'Location *';
    var locSelect = document.createElement('select');
    locSelect.className = 'server-input';
    locSelect.disabled = isReadOnly;
    ['query', 'header', 'path', 'cookie'].forEach(function(loc) {
      var opt = document.createElement('option');
      opt.value = loc;
      opt.textContent = loc;
      if (loc === defaultLocation) {
        opt.selected = true;
      }
      locSelect.appendChild(opt);
    });

    // Type field
    var typeLabel = document.createElement('label');
    typeLabel.textContent = 'Type';
    var typeSelect = document.createElement('select');
    typeSelect.className = 'server-input';
    ['string', 'integer', 'number', 'boolean', 'array'].forEach(function(t) {
      var opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      typeSelect.appendChild(opt);
    });

    // Required field
    var reqLabel = document.createElement('label');
    reqLabel.className = 'schema-checkbox-label';
    var reqCheckbox = document.createElement('input');
    reqCheckbox.type = 'checkbox';
    reqLabel.appendChild(reqCheckbox);
    reqLabel.appendChild(document.createTextNode(' Required'));

    // Description field
    var descLabel = document.createElement('label');
    descLabel.textContent = 'Description';
    var descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.className = 'server-input';
    descInput.placeholder = 'Parameter description';

    form.appendChild(keyLabel);
    form.appendChild(keyInput);
    form.appendChild(nameLabel);
    form.appendChild(nameInput);
    form.appendChild(locLabel);
    form.appendChild(locSelect);
    form.appendChild(typeLabel);
    form.appendChild(typeSelect);
    form.appendChild(reqLabel);
    form.appendChild(descLabel);
    form.appendChild(descInput);

    // Buttons
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
      var key = keyInput.value.trim();
      var name = nameInput.value.trim();
      if (!key) { keyInput.classList.add('error'); return; }
      if (!name) { nameInput.classList.add('error'); return; }

      var parameter = {
        name: name,
        in: locSelect.value,
        type: typeSelect.value,
        required: reqCheckbox.checked || undefined,
        description: descInput.value.trim() || undefined,
      };

      S.vscode.postMessage({
        type: 'addComponentParameter',
        payload: { filePath: S.currentFilePath, paramKey: key, parameter: parameter }
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
    keyInput.focus();

    var handleKeydown = function(e) {
      if (e.key === 'Enter') saveBtn.click();
      else if (e.key === 'Escape') overlay.remove();
    };
    keyInput.addEventListener('keydown', handleKeydown);
    nameInput.addEventListener('keydown', handleKeydown);
    descInput.addEventListener('keydown', handleKeydown);
  };
})();
