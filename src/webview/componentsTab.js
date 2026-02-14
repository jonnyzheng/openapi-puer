// Components tab logic for OpenAPI Puer webview
(function() {
  const S = window.OpenAPIPuer;

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

      headerActions.appendChild(addPropBtn);
      headerActions.appendChild(deleteSchemaBtn);

      header.appendChild(nameSpan);
      header.appendChild(typeSpan);
      header.appendChild(headerActions);
      card.appendChild(header);

      // Schema card tabs (Properties / Source)
      var schemaTabBar = document.createElement('div');
      schemaTabBar.className = 'schema-card-tabs';

      var propsTabBtn = document.createElement('button');
      propsTabBtn.className = 'schema-card-tab-btn active';
      propsTabBtn.textContent = 'Properties';

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

      card.appendChild(propsContent);
      card.appendChild(sourceContent);
      container.appendChild(card);
    });
  };
})();
