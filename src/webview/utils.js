// Shared state and utility functions for SuperAPI webview
window.SuperAPI = {
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

window.SuperAPI.escapeHtml = function(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

window.SuperAPI.getStatusClass = function(status) {
  const code = parseInt(status, 10);
  if (code >= 200 && code < 300) return 'status-2xx';
  if (code >= 300 && code < 400) return 'status-3xx';
  if (code >= 400 && code < 500) return 'status-4xx';
  if (code >= 500) return 'status-5xx';
  return '';
};

window.SuperAPI.formatSize = function(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

window.SuperAPI.capitalizeFirst = function(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

window.SuperAPI.formatExampleValue = function(value) {
  const escapeHtml = window.SuperAPI.escapeHtml;
  if (value === null) return '<span class="json-null">null</span>';
  if (typeof value === 'string') return `<span class="json-string">"${escapeHtml(value)}"</span>`;
  if (typeof value === 'number') return `<span class="json-number">${value}</span>`;
  if (typeof value === 'boolean') return `<span class="json-boolean">${value}</span>`;
  if (Array.isArray(value)) return `<span class="json-array">${escapeHtml(JSON.stringify(value))}</span>`;
  if (typeof value === 'object') return `<span class="json-object">${escapeHtml(JSON.stringify(value))}</span>`;
  return escapeHtml(String(value));
};

window.SuperAPI.renderSchemaValue = function(schema, indent, isLast) {
  if (indent === undefined) indent = 0;
  if (isLast === undefined) isLast = true;
  const escapeHtml = window.SuperAPI.escapeHtml;
  const renderSchemaValue = window.SuperAPI.renderSchemaValue;
  const formatExampleValue = window.SuperAPI.formatExampleValue;

  if (!schema) return '<span class="json-null">null</span>';

  const pad = '  '.repeat(indent);
  const nextPad = '  '.repeat(indent + 1);

  const refBadge = schema.$ref ? `<span class="json-ref">#${escapeHtml(schema.$ref)}</span> ` : '';

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

window.SuperAPI.renderSchema = function(schema, indent, isLast) {
  if (indent === undefined) indent = 0;
  if (isLast === undefined) isLast = true;
  const escapeHtml = window.SuperAPI.escapeHtml;
  const renderSchemaValue = window.SuperAPI.renderSchemaValue;

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
};

window.SuperAPI.generateSampleFromSchema = function(schema) {
  const generateSampleFromSchema = window.SuperAPI.generateSampleFromSchema;
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
};

window.SuperAPI.showDeleteConfirmDialog = function(paramName, onConfirm) {
  const escapeHtml = window.SuperAPI.escapeHtml;
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

  document.getElementById('cancel-delete').addEventListener('click', () => {
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

  document.getElementById('confirm-delete').addEventListener('click', () => {
    modal.remove();
    onConfirm();
  });
};
