// Shared state and utility functions for OpenAPI Puer webview
window.OpenAPIPuer = {
  vscode: acquireVsCodeApi(),
  currentEndpoint: null,
  currentServers: [],
  currentComponents: null,
  isLoading: false,
  lastResponse: null,
  startTime: null,
  elapsedInterval: null,
  searchMatches: [],
  currentMatchIndex: -1,
  currentFilePath: null,
};

window.OpenAPIPuer.escapeHtml = function(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

window.OpenAPIPuer.getStatusClass = function(status) {
  const code = parseInt(status, 10);
  if (code >= 200 && code < 300) return 'status-2xx';
  if (code >= 300 && code < 400) return 'status-3xx';
  if (code >= 400 && code < 500) return 'status-4xx';
  if (code >= 500) return 'status-5xx';
  return '';
};

window.OpenAPIPuer.formatSize = function(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

window.OpenAPIPuer.capitalizeFirst = function(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

window.OpenAPIPuer.formatExampleValue = function(value) {
  const escapeHtml = window.OpenAPIPuer.escapeHtml;
  if (value === null) return '<span class="json-null">null</span>';
  if (typeof value === 'string') return `<span class="json-string">"${escapeHtml(value)}"</span>`;
  if (typeof value === 'number') return `<span class="json-number">${value}</span>`;
  if (typeof value === 'boolean') return `<span class="json-boolean">${value}</span>`;
  if (Array.isArray(value)) return `<span class="json-array">${escapeHtml(JSON.stringify(value))}</span>`;
  if (typeof value === 'object') return `<span class="json-object">${escapeHtml(JSON.stringify(value))}</span>`;
  return escapeHtml(String(value));
};

window.OpenAPIPuer.renderSchemaValue = function(schema, indent, isLast) {
  if (indent === undefined) indent = 0;
  if (isLast === undefined) isLast = true;
  const escapeHtml = window.OpenAPIPuer.escapeHtml;
  const renderSchemaValue = window.OpenAPIPuer.renderSchemaValue;
  const formatExampleValue = window.OpenAPIPuer.formatExampleValue;

  if (!schema) return '<span class="json-null">null</span>';

  const pad = '  '.repeat(indent);
  const nextPad = '  '.repeat(indent + 1);

  const refBadge = schema.$ref ? `<span class="json-ref">#${escapeHtml(schema.$ref)}</span> ` : '';
  const mergedBadge = schema._mergedFrom && schema._mergedFrom.length > 0
    ? `<span class="schema-merged-indicator">(merged: ${schema._mergedFrom.map(r => escapeHtml(r)).join(', ')})</span> `
    : '';

  // Handle oneOf - display as alternatives
  if (schema.oneOf && schema.oneOf.length > 0) {
    let html = `${refBadge}<span class="schema-keyword">oneOf</span> [\n`;
    schema.oneOf.forEach((option, i) => {
      const isLastOption = i === schema.oneOf.length - 1;
      const comma = isLastOption ? '' : '<span class="json-comma">,</span>';
      html += `${nextPad}${renderSchemaValue(option, indent + 1, isLastOption)}${comma}\n`;
    });
    html += `${pad}]`;
    return html;
  }

  // Handle anyOf - display as alternatives
  if (schema.anyOf && schema.anyOf.length > 0) {
    let html = `${refBadge}<span class="schema-keyword">anyOf</span> [\n`;
    schema.anyOf.forEach((option, i) => {
      const isLastOption = i === schema.anyOf.length - 1;
      const comma = isLastOption ? '' : '<span class="json-comma">,</span>';
      html += `${nextPad}${renderSchemaValue(option, indent + 1, isLastOption)}${comma}\n`;
    });
    html += `${pad}]`;
    return html;
  }

  if (schema.type === 'object' && schema.properties) {
    const props = Object.entries(schema.properties);
    if (props.length === 0) {
      return `${refBadge}${mergedBadge}<span class="json-brace">{}</span>`;
    }
    let html = `${refBadge}${mergedBadge}<span class="json-brace">{</span>\n`;
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

  if (schema.type === 'array' && schema.items) {
    let html = `${refBadge}<span class="json-bracket">[</span>\n`;
    html += `${nextPad}${renderSchemaValue(schema.items, indent + 1, true)}\n`;
    html += `${pad}<span class="json-bracket">]</span>`;
    return html;
  }

  const type = schema.type || 'any';
  const format = schema.format ? ` <span class="json-format">(${schema.format})</span>` : '';
  const example = schema.example !== undefined ? `: <span class="json-example">${formatExampleValue(schema.example)}</span>` : '';
  const enumValues = schema.enum ? ` <span class="json-enum">[${schema.enum.map(e => `"${e}"`).join(' | ')}]</span>` : '';

  return `${refBadge}<span class="json-type">${type}</span>${format}${example}${enumValues}`;
};

window.OpenAPIPuer.renderSchema = function(schema, indent, isLast) {
  if (indent === undefined) indent = 0;
  if (isLast === undefined) isLast = true;
  const escapeHtml = window.OpenAPIPuer.escapeHtml;
  const renderSchemaValue = window.OpenAPIPuer.renderSchemaValue;

  if (!schema) return '';

  const pad = '  '.repeat(indent);
  const nextPad = '  '.repeat(indent + 1);
  let html = '';

  // Handle oneOf at top level
  if (schema.oneOf && schema.oneOf.length > 0) {
    html += `<span class="schema-keyword">oneOf</span> [\n`;
    schema.oneOf.forEach((option, i) => {
      const isLastOption = i === schema.oneOf.length - 1;
      const comma = isLastOption ? '' : '<span class="json-comma">,</span>';
      html += `${nextPad}${renderSchemaValue(option, indent + 1, isLastOption)}${comma}\n`;
    });
    html += `${pad}]`;
    return html;
  }

  // Handle anyOf at top level
  if (schema.anyOf && schema.anyOf.length > 0) {
    html += `<span class="schema-keyword">anyOf</span> [\n`;
    schema.anyOf.forEach((option, i) => {
      const isLastOption = i === schema.anyOf.length - 1;
      const comma = isLastOption ? '' : '<span class="json-comma">,</span>';
      html += `${nextPad}${renderSchemaValue(option, indent + 1, isLastOption)}${comma}\n`;
    });
    html += `${pad}]`;
    return html;
  }

  // Show merged indicator for allOf results
  const mergedBadge = schema._mergedFrom && schema._mergedFrom.length > 0
    ? `<span class="schema-merged-indicator">(merged: ${schema._mergedFrom.map(r => escapeHtml(r)).join(', ')})</span> `
    : '';

  if (schema.type === 'object' && schema.properties) {
    const props = Object.entries(schema.properties);
    if (props.length === 0) {
      html += `${mergedBadge}<span class="json-brace">{}</span>`;
    } else {
      html += `${mergedBadge}<span class="json-brace">{</span>\n`;
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
};

window.OpenAPIPuer.generateSampleFromSchema = function(schema) {
  const generateSampleFromSchema = window.OpenAPIPuer.generateSampleFromSchema;
  if (!schema) return null;

  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;

  // Handle oneOf/anyOf - use first option for sample
  if (schema.oneOf && schema.oneOf.length > 0) {
    return generateSampleFromSchema(schema.oneOf[0]);
  }
  if (schema.anyOf && schema.anyOf.length > 0) {
    return generateSampleFromSchema(schema.anyOf[0]);
  }

  // Handle merged allOf schemas (they have _mergedFrom but are already flattened)
  // Just continue with normal processing since properties are already merged

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
      // If no type but has properties, treat as object
      if (schema.properties) {
        const obj = {};
        for (const [key, prop] of Object.entries(schema.properties)) {
          obj[key] = generateSampleFromSchema(prop);
        }
        return obj;
      }
      return null;
  }
};

// Generate empty template from schema (fields with empty values)
window.OpenAPIPuer.generateEmptyTemplateFromSchema = function(schema) {
  const generateEmptyTemplateFromSchema = window.OpenAPIPuer.generateEmptyTemplateFromSchema;
  if (!schema) return null;

  // Handle oneOf/anyOf - use first option for template
  if (schema.oneOf && schema.oneOf.length > 0) {
    return generateEmptyTemplateFromSchema(schema.oneOf[0]);
  }
  if (schema.anyOf && schema.anyOf.length > 0) {
    return generateEmptyTemplateFromSchema(schema.anyOf[0]);
  }

  // If schema has properties but no type, treat it as object
  if (schema.properties && !schema.type) {
    const obj = {};
    for (const [key, prop] of Object.entries(schema.properties)) {
      obj[key] = generateEmptyTemplateFromSchema(prop);
    }
    return obj;
  }

  switch (schema.type) {
    case 'object':
      const obj = {};
      if (schema.properties) {
        for (const [key, prop] of Object.entries(schema.properties)) {
          obj[key] = generateEmptyTemplateFromSchema(prop);
        }
      }
      return obj;
    case 'array':
      return [];
    case 'string':
      return '';
    case 'number':
    case 'integer':
      return null;
    case 'boolean':
      return null;
    default:
      // If no type but has other properties, return empty object
      if (Object.keys(schema).length > 0) {
        return {};
      }
      return null;
  }
};

window.OpenAPIPuer.highlightJson = function(jsonStr) {
  // Use Prism.js for JSON syntax highlighting
  if (typeof Prism !== 'undefined' && Prism.languages.json) {
    return Prism.highlight(jsonStr, Prism.languages.json, 'json');
  }
  // Fallback to escaping if Prism is not available
  return window.OpenAPIPuer.escapeHtml(jsonStr);
};

/**
 * Reusable confirmation dialog
 * @param {Object} options - Dialog options
 * @param {string} options.title - Dialog title (default: 'Confirm Delete')
 * @param {string} options.message - HTML message content
 * @param {string} options.confirmText - Confirm button text (default: 'Delete')
 * @param {string} options.confirmClass - Confirm button class (default: 'server-dialog-delete')
 * @param {Function} options.onConfirm - Callback when confirmed
 * @returns {void}
 */
window.OpenAPIPuer.showConfirmDialog = function(options) {
  var escapeHtml = window.OpenAPIPuer.escapeHtml;

  // Support legacy signature: showConfirmDialog(message, onConfirm)
  if (typeof options === 'string') {
    options = {
      title: 'Confirm Delete',
      message: arguments[0],
      confirmText: 'Delete',
      confirmClass: 'server-dialog-delete',
      onConfirm: arguments[1]
    };
  }

  // Set defaults
  var title = options.title || 'Confirm Delete';
  var message = options.message || '';
  var confirmText = options.confirmText || 'Delete';
  var confirmClass = options.confirmClass || 'server-dialog-delete';
  var onConfirm = options.onConfirm || function() {};

  var existingDialog = document.querySelector('.server-dialog-overlay');
  if (existingDialog) existingDialog.remove();

  var overlay = document.createElement('div');
  overlay.className = 'server-dialog-overlay';

  var dialog = document.createElement('div');
  dialog.className = 'server-dialog';
  dialog.style.minWidth = '400px';
  dialog.style.maxWidth = '500px';

  var titleEl = document.createElement('h3');
  titleEl.textContent = title;
  dialog.appendChild(titleEl);

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
  confirmBtn.className = confirmClass;
  confirmBtn.textContent = confirmText;
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

  // Close on overlay click
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) overlay.remove();
  });

  // Close on Escape key
  var handleEscape = function(e) {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
};
