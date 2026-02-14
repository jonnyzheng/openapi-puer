// SchemaTable - Reusable schema table component with nested object/array support
(function() {
  'use strict';

  /**
   * Create a schema table component
   * @param {Object} options
   * @param {HTMLElement} options.container - Container element to render into
   * @param {Object} options.schema - Schema object with properties and required
   * @param {Function} options.onSchemaChange - Callback when schema changes (receives full schema)
   * @param {Function} options.onDirtyChange - Callback when dirty state changes (receives boolean isDirty)
   * @param {Function} options.onShowOthersDialog - Callback to show Others detail dialog (path, propDef, onSave)
   * @param {boolean} options.readOnly - If true, table is read-only
   * @returns {Object} - { getSchema, refresh, destroy, isDirty, setClean }
   */
  function createSchemaTable(options) {
    var container = options.container;
    var schema = options.schema || {};
    var onSchemaChange = options.onSchemaChange;
    var onDirtyChange = options.onDirtyChange;
    var onShowOthersDialog = options.onShowOthersDialog;
    var readOnly = options.readOnly || false;

    // State
    var propertyDefs = {};
    var tbody = null;
    var table = null;
    var isDirty = false;

    // Helper: Check if type can have children
    function canHaveChildren(type) {
      return type === 'object' || type === 'array';
    }

    // Helper: Check if a property definition has nested properties
    function hasNestedProperties(propDef) {
      if (!propDef) return false;
      if (propDef.type === 'object' && propDef.properties && Object.keys(propDef.properties).length > 0) {
        return true;
      }
      if (propDef.type === 'array' && propDef.items && propDef.items.type === 'object' && propDef.items.properties) {
        return Object.keys(propDef.items.properties).length > 0;
      }
      return false;
    }

    // Helper: Get nested properties from a property definition
    function getNestedProperties(propDef) {
      if (!propDef) return null;
      if (propDef.type === 'object' && propDef.properties) {
        return { properties: propDef.properties, required: propDef.required || [] };
      }
      if (propDef.type === 'array' && propDef.items && propDef.items.properties) {
        return { properties: propDef.items.properties, required: propDef.items.required || [] };
      }
      return null;
    }

    // Toggle children visibility
    function toggleChildren(row) {
      var path = row.getAttribute('data-path');
      var isExpanded = row.getAttribute('data-expanded') === 'true';
      var chevron = row.querySelector('.schema-chevron');

      if (isExpanded) {
        // Collapse: hide all descendants
        row.setAttribute('data-expanded', 'false');
        if (chevron) chevron.classList.remove('expanded');
        // Hide all descendants (direct children and their children)
        var rows = tbody.querySelectorAll('tr');
        rows.forEach(function(child) {
          var childParent = child.getAttribute('data-parent');
          if (childParent === path || (childParent && childParent.indexOf(path + '.') === 0)) {
            child.classList.add('schema-hidden');
          }
        });
      } else {
        // Expand: show direct children only
        row.setAttribute('data-expanded', 'true');
        if (chevron) chevron.classList.add('expanded');
        var directChildren = tbody.querySelectorAll('tr[data-parent="' + path + '"]');
        directChildren.forEach(function(child) {
          child.classList.remove('schema-hidden');
        });
      }
    }

    // Show custom confirmation dialog
    function showConfirmDialog(message, onConfirm) {
      var overlay = document.createElement('div');
      overlay.className = 'server-dialog-overlay';

      var dialog = document.createElement('div');
      dialog.className = 'server-dialog';
      dialog.style.minWidth = '400px';
      dialog.style.maxWidth = '500px';

      var title = document.createElement('h3');
      title.textContent = 'Confirm Delete';
      dialog.appendChild(title);

      var messageEl = document.createElement('p');
      messageEl.className = 'server-delete-message';
      messageEl.innerHTML = message;
      dialog.appendChild(messageEl);

      var buttons = document.createElement('div');
      buttons.className = 'server-dialog-buttons';

      var cancelBtn = document.createElement('button');
      cancelBtn.className = 'server-dialog-cancel';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', function() {
        overlay.remove();
      });
      buttons.appendChild(cancelBtn);

      var confirmBtn = document.createElement('button');
      confirmBtn.className = 'server-dialog-delete';
      confirmBtn.textContent = 'Delete';
      confirmBtn.addEventListener('click', function() {
        overlay.remove();
        onConfirm();
      });
      buttons.appendChild(confirmBtn);

      dialog.appendChild(buttons);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      // Focus cancel button for safety
      cancelBtn.focus();
    }

    // Remove all children of a row
    function removeChildren(path) {
      // Find direct children and descendants
      // Match data-parent that equals path exactly OR starts with path + "."
      var rows = tbody.querySelectorAll('tr');
      rows.forEach(function(child) {
        var childParent = child.getAttribute('data-parent');
        if (childParent === path || (childParent && childParent.indexOf(path + '.') === 0)) {
          var childPath = child.getAttribute('data-path');
          delete propertyDefs[childPath];
          child.remove();
        }
      });
    }

    // Find insertion point for a new row
    function findInsertionPoint(parentPath) {
      var rows = tbody.querySelectorAll('tr');
      var lastMatchingRow = null;
      for (var i = 0; i < rows.length; i++) {
        var rowPath = rows[i].getAttribute('data-path');
        var rowParent = rows[i].getAttribute('data-parent');
        if (rowPath === parentPath || (rowParent && rowParent.indexOf(parentPath) === 0)) {
          lastMatchingRow = rows[i];
        }
      }
      return lastMatchingRow ? lastMatchingRow.nextElementSibling : null;
    }

    // Get Others summary text
    function getOthersSummary(propDef) {
      if (!propDef) return '—';
      var parts = [];
      if (propDef.format) parts.push(propDef.format);
      if (propDef.example !== undefined) parts.push('ex: ' + String(propDef.example).substring(0, 20));
      if (propDef.enum) parts.push('enum');
      if (propDef.pattern) parts.push('pattern');
      if (propDef.minimum !== undefined || propDef.maximum !== undefined) parts.push('range');
      if (propDef.minLength !== undefined || propDef.maxLength !== undefined) parts.push('length');
      if (propDef.nullable) parts.push('nullable');
      if (propDef.deprecated) parts.push('deprecated');
      return parts.length > 0 ? parts.join(', ') : '—';
    }

    // Get Others details for tooltip
    function getOthersDetails(propDef) {
      if (!propDef) return [];
      var details = [];
      var skipKeys = ['type', 'description', 'properties', 'items', 'required', '$ref'];
      for (var key in propDef) {
        if (skipKeys.indexOf(key) === -1 && propDef[key] !== undefined && propDef[key] !== null && propDef[key] !== '') {
          var val = propDef[key];
          if (typeof val === 'object') val = JSON.stringify(val);
          details.push({ key: key, value: String(val) });
        }
      }
      return details;
    }

    // Add a tree row
    function addTreeRow(data, path, depth, parentPath, isHidden) {
      var tr = document.createElement('tr');
      tr.className = 'schema-row';
      tr.setAttribute('data-path', path);
      tr.setAttribute('data-depth', depth);
      tr.setAttribute('data-parent', parentPath);
      tr.setAttribute('data-expanded', 'false');
      if (isHidden) tr.classList.add('schema-hidden');

      var propDef = data.others || { type: data.type || 'string' };
      propertyDefs[path] = propDef;

      var hasChildren = hasNestedProperties(propDef);
      var type = data.type || 'string';

      // Name cell with indentation and chevron
      var tdName = document.createElement('td');
      var nameCell = document.createElement('div');
      nameCell.className = 'schema-name-cell';

      // Indentation spacer
      if (depth > 0) {
        var indent = document.createElement('span');
        indent.className = 'schema-indent';
        nameCell.appendChild(indent);
      }

      // Chevron for expandable items
      var chevron = document.createElement('span');
      chevron.className = 'schema-chevron' + (hasChildren ? '' : ' placeholder');
      chevron.textContent = '\u25B6'; // ▶
      if (hasChildren) {
        chevron.addEventListener('click', function(e) {
          e.stopPropagation();
          toggleChildren(tr);
        });
      }
      nameCell.appendChild(chevron);

      // Name input
      var nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'schema-name-input';
      nameInput.value = data.name || '';
      nameInput.placeholder = 'field name';
      nameInput.disabled = readOnly;
      nameInput.addEventListener('change', function() {
        // Update path when name changes
        var oldPath = tr.getAttribute('data-path');
        var newName = nameInput.value.trim();
        var newPath = parentPath ? parentPath + '.' + newName : newName;

        // Update this row's path
        tr.setAttribute('data-path', newPath);

        // Update propertyDefs
        propertyDefs[newPath] = propertyDefs[oldPath];
        delete propertyDefs[oldPath];

        // Update children paths
        var children = tbody.querySelectorAll('tr[data-parent^="' + oldPath + '"]');
        children.forEach(function(child) {
          var childPath = child.getAttribute('data-path');
          var childParent = child.getAttribute('data-parent');
          var newChildPath = childPath.replace(oldPath, newPath);
          var newChildParent = childParent.replace(oldPath, newPath);
          child.setAttribute('data-path', newChildPath);
          child.setAttribute('data-parent', newChildParent);
          propertyDefs[newChildPath] = propertyDefs[childPath];
          delete propertyDefs[childPath];
        });

        notifyChange();
      });
      nameCell.appendChild(nameInput);

      // Add child button for object/array types
      if (!readOnly) {
        var addChildBtn = document.createElement('button');
        addChildBtn.className = 'schema-add-child-btn';
        addChildBtn.textContent = '+';
        addChildBtn.title = 'Add nested property';
        addChildBtn.style.display = canHaveChildren(type) ? '' : 'none';
        addChildBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          var currentPath = tr.getAttribute('data-path');
          var childPath = currentPath + '.newField';
          var childDepth = parseInt(tr.getAttribute('data-depth')) + 1;

          // Ensure parent is expanded
          tr.setAttribute('data-expanded', 'true');
          chevron.classList.add('expanded');
          chevron.classList.remove('placeholder');

          // Add new child row
          var insertPoint = findInsertionPoint(currentPath);
          var newRow = addTreeRow(
            { name: '', type: 'string', description: '', required: false, others: { type: 'string' } },
            childPath,
            childDepth,
            currentPath,
            false
          );
          if (insertPoint) {
            tbody.insertBefore(newRow, insertPoint);
          } else {
            tbody.appendChild(newRow);
          }

          // Focus the new row's name input
          var newNameInput = newRow.querySelector('.schema-name-input');
          if (newNameInput) newNameInput.focus();

          notifyChange();
        });
        nameCell.appendChild(addChildBtn);
      }

      tdName.appendChild(nameCell);
      tr.appendChild(tdName);

      // Type cell
      var tdType = document.createElement('td');
      var typeSelect = document.createElement('select');
      typeSelect.className = 'schema-type-select';
      typeSelect.disabled = readOnly;
      ['string', 'integer', 'number', 'boolean', 'array', 'object'].forEach(function(t) {
        var opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        if (t === type) opt.selected = true;
        typeSelect.appendChild(opt);
      });
      typeSelect.addEventListener('change', function() {
        var newType = typeSelect.value;
        var currentPath = tr.getAttribute('data-path');

        // Update propertyDefs
        if (propertyDefs[currentPath]) {
          propertyDefs[currentPath].type = newType;
        }

        // Show/hide add child button
        var addBtn = nameCell.querySelector('.schema-add-child-btn');
        if (addBtn) {
          addBtn.style.display = canHaveChildren(newType) ? '' : 'none';
        }

        // If changing away from object/array, remove children
        if (!canHaveChildren(newType)) {
          removeChildren(currentPath);
          chevron.classList.add('placeholder');
          chevron.classList.remove('expanded');
          tr.setAttribute('data-expanded', 'false');
        }

        // If changing to object/array, update chevron
        if (canHaveChildren(newType)) {
          var hasKids = tbody.querySelectorAll('tr[data-parent="' + currentPath + '"]').length > 0;
          if (hasKids) {
            chevron.classList.remove('placeholder');
          }
        }

        notifyChange();
      });
      tdType.appendChild(typeSelect);
      tr.appendChild(tdType);

      // Description cell
      var tdDesc = document.createElement('td');
      var descInput = document.createElement('input');
      descInput.type = 'text';
      descInput.className = 'schema-desc-input';
      descInput.value = data.description || '';
      descInput.placeholder = 'description';
      descInput.disabled = readOnly;
      descInput.addEventListener('change', function() {
        var currentPath = tr.getAttribute('data-path');
        if (propertyDefs[currentPath]) {
          propertyDefs[currentPath].description = descInput.value;
        }
        notifyChange();
      });
      tdDesc.appendChild(descInput);
      tr.appendChild(tdDesc);

      // Others cell
      var tdOthers = document.createElement('td');
      tdOthers.className = 'schema-others-cell';
      var othersSpan = document.createElement('span');

      function updateOthersSummary() {
        var currentPath = tr.getAttribute('data-path');
        var currentPropDef = propertyDefs[currentPath] || {};
        var summary = getOthersSummary(currentPropDef);
        if (summary === '—') {
          othersSpan.className = 'schema-others-placeholder';
          othersSpan.textContent = '—';
        } else {
          othersSpan.className = 'schema-others-summary';
          othersSpan.textContent = summary;
        }
      }
      updateOthersSummary();
      tdOthers.appendChild(othersSpan);

      // Tooltip on hover
      (function(cell, getPath) {
        var tooltip = null;
        cell.addEventListener('mouseenter', function() {
          var currentPropDef = propertyDefs[getPath()] || {};
          var details = getOthersDetails(currentPropDef);
          if (details.length === 0) return;

          tooltip = document.createElement('div');
          tooltip.className = 'schema-others-tooltip';

          var tooltipTable = document.createElement('table');
          tooltipTable.className = 'schema-others-tooltip-table';
          for (var i = 0; i < details.length; i++) {
            var tooltipTr = document.createElement('tr');
            var tdKey = document.createElement('td');
            tdKey.className = 'schema-others-tooltip-key';
            tdKey.textContent = details[i].key;
            var tdVal = document.createElement('td');
            tdVal.className = 'schema-others-tooltip-value';
            tdVal.textContent = details[i].value;
            tooltipTr.appendChild(tdKey);
            tooltipTr.appendChild(tdVal);
            tooltipTable.appendChild(tooltipTr);
          }
          tooltip.appendChild(tooltipTable);
          cell.appendChild(tooltip);
        });
        cell.addEventListener('mouseleave', function() {
          if (tooltip && tooltip.parentNode) {
            tooltip.parentNode.removeChild(tooltip);
            tooltip = null;
          }
        });
      })(tdOthers, function() { return tr.getAttribute('data-path'); });

      // Click to edit Others
      if (!readOnly && onShowOthersDialog) {
        tdOthers.style.cursor = 'pointer';
        tdOthers.addEventListener('click', function() {
          var currentPath = tr.getAttribute('data-path');
          var currentName = nameInput.value.trim();
          if (!currentName) {
            alert('Please enter a field name first');
            return;
          }
          onShowOthersDialog(currentName, propertyDefs[currentPath] || { type: typeSelect.value }, function(updatedDef) {
            propertyDefs[currentPath] = updatedDef;
            typeSelect.value = updatedDef.type || 'string';
            descInput.value = updatedDef.description || '';
            updateOthersSummary();
            notifyChange();
          });
        });
      }
      tr.appendChild(tdOthers);

      // Required cell
      var tdReq = document.createElement('td');
      var reqCheckbox = document.createElement('input');
      reqCheckbox.type = 'checkbox';
      reqCheckbox.className = 'schema-required-checkbox';
      reqCheckbox.checked = data.required || false;
      reqCheckbox.disabled = readOnly;
      reqCheckbox.addEventListener('change', function() {
        notifyChange();
      });
      tdReq.appendChild(reqCheckbox);
      tr.appendChild(tdReq);

      // Delete cell
      if (!readOnly) {
        var tdDel = document.createElement('td');
        var delBtn = document.createElement('button');
        delBtn.className = 'schema-delete-btn';
        delBtn.textContent = '\u2715'; // ✕
        delBtn.title = 'Delete field';
        delBtn.addEventListener('click', function() {
          var currentPath = tr.getAttribute('data-path');
          var fieldName = nameInput.value.trim() || 'this field';
          var childCount = tbody.querySelectorAll('tr[data-parent="' + currentPath + '"]').length;
          var message = 'Are you sure you want to delete <code>' + fieldName + '</code>?';
          if (childCount > 0) {
            message += '<br><br>This will also delete ' + childCount + ' nested field' + (childCount > 1 ? 's' : '') + '.';
          }
          showConfirmDialog(message, function() {
            removeChildren(currentPath);
            delete propertyDefs[currentPath];
            tr.remove();
            notifyChange();
          });
        });
        tdDel.appendChild(delBtn);
        tr.appendChild(tdDel);
      }

      return tr;
    }

    // Recursively add rows from schema
    function addRowsFromSchema(properties, requiredList, parentPath, depth, isHidden) {
      if (!properties) return;
      Object.keys(properties).forEach(function(name) {
        var prop = properties[name];
        var path = parentPath ? parentPath + '.' + name : name;
        var isRequired = requiredList && requiredList.indexOf(name) !== -1;

        var row = addTreeRow({
          name: name,
          type: prop.type || 'string',
          description: prop.description || '',
          required: isRequired,
          others: prop
        }, path, depth, parentPath, isHidden);
        tbody.appendChild(row);

        // Recursively add nested properties
        var nested = getNestedProperties(prop);
        if (nested && nested.properties) {
          addRowsFromSchema(nested.properties, nested.required, path, depth + 1, true);
        }
      });
    }

    // Collect schema from tree rows (recursive)
    function collectSchemaFromRows() {
      var rootSchema = { type: 'object', properties: {}, required: [] };

      function collectChildren(parentPath, targetProps, targetRequired) {
        var selector = parentPath ? 'tr[data-parent="' + parentPath + '"]' : 'tr[data-depth="0"]';
        var rows = tbody.querySelectorAll(selector);

        rows.forEach(function(row) {
          var path = row.getAttribute('data-path');
          var nameInput = row.querySelector('.schema-name-input');
          var typeSelect = row.querySelector('.schema-type-select');
          var reqCheckbox = row.querySelector('.schema-required-checkbox');
          var descInput = row.querySelector('.schema-desc-input');

          var name = nameInput ? nameInput.value.trim() : '';
          if (!name) return;

          var type = typeSelect ? typeSelect.value : 'string';
          var isRequired = reqCheckbox ? reqCheckbox.checked : false;
          var description = descInput ? descInput.value.trim() : '';

          // Get base property definition
          var prop = propertyDefs[path] ? Object.assign({}, propertyDefs[path]) : { type: type };
          prop.type = type;
          if (description) {
            prop.description = description;
          } else {
            delete prop.description;
          }

          // Check for children
          var childRows = tbody.querySelectorAll('tr[data-parent="' + path + '"]');
          if (childRows.length > 0) {
            if (type === 'object') {
              prop.properties = {};
              prop.required = [];
              collectChildren(path, prop.properties, prop.required);
              if (prop.required.length === 0) delete prop.required;
            } else if (type === 'array') {
              prop.items = { type: 'object', properties: {}, required: [] };
              collectChildren(path, prop.items.properties, prop.items.required);
              if (prop.items.required.length === 0) delete prop.items.required;
            }
          }

          targetProps[name] = prop;
          if (isRequired) targetRequired.push(name);
        });
      }

      collectChildren('', rootSchema.properties, rootSchema.required);
      if (rootSchema.required.length === 0) delete rootSchema.required;

      return rootSchema;
    }

    // Mark as dirty and notify
    function markDirty() {
      if (!isDirty) {
        isDirty = true;
        if (onDirtyChange) {
          onDirtyChange(true);
        }
      }
    }

    // Mark as clean
    function markClean() {
      if (isDirty) {
        isDirty = false;
        if (onDirtyChange) {
          onDirtyChange(false);
        }
      }
    }

    // Notify schema change
    function notifyChange() {
      markDirty();
      if (onSchemaChange) {
        onSchemaChange(collectSchemaFromRows());
      }
    }

    // Render the table
    function render() {
      // Clear container
      container.innerHTML = '';
      propertyDefs = {};

      // Create table
      table = document.createElement('table');
      table.className = 'schema-table';

      var thead = document.createElement('thead');
      var headerRow = '<tr><th>Name</th><th>Type</th><th>Description</th><th>Others</th><th>Required</th>';
      if (!readOnly) headerRow += '<th></th>';
      headerRow += '</tr>';
      thead.innerHTML = headerRow;
      table.appendChild(thead);

      tbody = document.createElement('tbody');
      table.appendChild(tbody);

      // Initialize from existing schema
      if (schema && schema.properties) {
        addRowsFromSchema(schema.properties, schema.required || [], '', 0, false);
      }

      container.appendChild(table);

      // Add field button
      if (!readOnly) {
        var addRow = document.createElement('div');
        addRow.className = 'schema-add-row';
        var addBtn = document.createElement('button');
        addBtn.className = 'schema-add-btn';
        addBtn.textContent = '+ Add Field';
        addBtn.addEventListener('click', function() {
          var newPath = 'newField' + Date.now();
          var row = addTreeRow(
            { name: '', type: 'string', description: '', required: false, others: { type: 'string' } },
            newPath, 0, '', false
          );
          tbody.appendChild(row);
          var nameInput = row.querySelector('.schema-name-input');
          if (nameInput) nameInput.focus();
          notifyChange();
        });
        addRow.appendChild(addBtn);
        container.appendChild(addRow);
      }
    }

    // Initial render
    render();

    // Public API
    return {
      getSchema: function() {
        return collectSchemaFromRows();
      },
      refresh: function(newSchema) {
        schema = newSchema || {};
        isDirty = false;
        render();
      },
      destroy: function() {
        container.innerHTML = '';
        propertyDefs = {};
        tbody = null;
        table = null;
      },
      isDirty: function() {
        return isDirty;
      },
      setClean: function() {
        markClean();
      }
    };
  }

  // Export to window
  window.SchemaTable = {
    create: createSchemaTable
  };
})();
