(function() {
  const vscode = acquireVsCodeApi();

  const state = {
    environments: [],
    activeEnvironmentId: undefined,
    selectedEnvironmentId: undefined,
  };

  const refs = {
    list: document.getElementById('environment-list'),
    details: document.getElementById('environment-details'),
    empty: document.getElementById('environment-empty'),
    addEnvironment: document.getElementById('add-environment'),
    importEnvironment: document.getElementById('import-environment'),
    exportEnvironment: document.getElementById('export-environment'),
    dialogRoot: document.getElementById('confirm-dialog-root')
  };

  function normalizeType(type) {
    return type === 'secret' || type === 'url' || type === 'text' ? type : 'text';
  }

  function normalizeVariable(variable) {
    return {
      key: typeof variable?.key === 'string' ? variable.key : '',
      value: typeof variable?.value === 'string' ? variable.value : '',
      description: typeof variable?.description === 'string' ? variable.description : '',
      isSecret: Boolean(variable?.isSecret),
      type: normalizeType(variable?.type)
    };
  }

  function normalizeEnvironment(environment) {
    const now = new Date().toISOString();
    return {
      id: typeof environment?.id === 'string' && environment.id.trim() ? environment.id : generateEnvironmentId(),
      name: typeof environment?.name === 'string' && environment.name.trim() ? environment.name : 'Environment',
      baseUrl: typeof environment?.baseUrl === 'string' ? environment.baseUrl : '',
      description: typeof environment?.description === 'string' ? environment.description : '',
      variables: Array.isArray(environment?.variables) ? environment.variables.map(normalizeVariable) : [],
      createdAt: typeof environment?.createdAt === 'string' ? environment.createdAt : now,
      updatedAt: typeof environment?.updatedAt === 'string' ? environment.updatedAt : now
    };
  }

  function generateEnvironmentId() {
    return `env_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function generateUniqueName(baseName) {
    const normalizedNames = new Set(state.environments.map((environment) => environment.name.toLowerCase()));
    if (!normalizedNames.has(baseName.toLowerCase())) {
      return baseName;
    }

    let suffix = 2;
    let candidate = `${baseName} (${suffix})`;
    while (normalizedNames.has(candidate.toLowerCase())) {
      suffix += 1;
      candidate = `${baseName} (${suffix})`;
    }
    return candidate;
  }

  function markEnvironmentUpdated(environment) {
    environment.updatedAt = new Date().toISOString();
  }

  function setSelectedEnvironment(environmentId) {
    state.selectedEnvironmentId = environmentId;
    render();
  }

  function getSelectedEnvironment() {
    return state.environments.find((environment) => environment.id === state.selectedEnvironmentId);
  }

  function ensureValidSelection() {
    if (state.environments.length === 0) {
      state.selectedEnvironmentId = undefined;
      return;
    }

    const selected = getSelectedEnvironment();
    if (!selected) {
      state.selectedEnvironmentId = state.environments[0].id;
    }
  }

  function persist() {
    vscode.postMessage({
      type: 'saveDocument',
      payload: {
        environments: state.environments
      }
    });
  }

  function confirmDialog(title, message, confirmLabel) {
    return new Promise((resolve) => {
      refs.dialogRoot.innerHTML = '';

      const overlay = document.createElement('div');
      overlay.className = 'dialog-overlay';

      const dialog = document.createElement('div');
      dialog.className = 'dialog';

      const titleElement = document.createElement('h4');
      titleElement.textContent = title;

      const messageElement = document.createElement('p');
      messageElement.textContent = message;

      const actions = document.createElement('div');
      actions.className = 'dialog-actions';

      const cancelButton = document.createElement('button');
      cancelButton.className = 'secondary-btn';
      cancelButton.type = 'button';
      cancelButton.textContent = 'Cancel';

      const confirmButton = document.createElement('button');
      confirmButton.className = 'danger-btn';
      confirmButton.type = 'button';
      confirmButton.textContent = confirmLabel;

      cancelButton.addEventListener('click', () => {
        refs.dialogRoot.innerHTML = '';
        resolve(false);
      });

      confirmButton.addEventListener('click', () => {
        refs.dialogRoot.innerHTML = '';
        resolve(true);
      });

      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
          refs.dialogRoot.innerHTML = '';
          resolve(false);
        }
      });

      actions.appendChild(cancelButton);
      actions.appendChild(confirmButton);
      dialog.appendChild(titleElement);
      dialog.appendChild(messageElement);
      dialog.appendChild(actions);
      overlay.appendChild(dialog);
      refs.dialogRoot.appendChild(overlay);
    });
  }

  function renderEnvironmentList() {
    refs.list.innerHTML = '';
    refs.empty.classList.toggle('hidden', state.environments.length > 0);

    state.environments.forEach((environment) => {
      const item = document.createElement('li');
      item.className = `environment-item${environment.id === state.selectedEnvironmentId ? ' active' : ''}`;

      const body = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'environment-name';
      name.textContent = environment.name;
      body.appendChild(name);

      const meta = document.createElement('div');
      meta.className = 'environment-meta';
      meta.textContent = `${environment.variables.length} variable${environment.variables.length === 1 ? '' : 's'}`;
      body.appendChild(meta);

      if (environment.id === state.activeEnvironmentId) {
        const pill = document.createElement('span');
        pill.className = 'active-pill';
        pill.textContent = 'ACTIVE';
        body.appendChild(pill);
      }

      const actions = document.createElement('div');
      actions.className = 'environment-actions';

      const duplicateButton = document.createElement('button');
      duplicateButton.className = 'icon-btn';
      duplicateButton.type = 'button';
      duplicateButton.title = 'Duplicate environment';
      duplicateButton.textContent = '⧉';

      duplicateButton.addEventListener('click', (event) => {
        event.stopPropagation();
        duplicateEnvironment(environment.id);
      });

      const deleteButton = document.createElement('button');
      deleteButton.className = 'icon-btn';
      deleteButton.type = 'button';
      deleteButton.title = 'Delete environment';
      deleteButton.textContent = '✕';

      deleteButton.addEventListener('click', async (event) => {
        event.stopPropagation();
        await deleteEnvironment(environment.id);
      });

      actions.appendChild(duplicateButton);
      actions.appendChild(deleteButton);

      item.appendChild(body);
      item.appendChild(actions);

      item.addEventListener('click', () => {
        setSelectedEnvironment(environment.id);
      });

      refs.list.appendChild(item);
    });
  }

  function createField(label, input) {
    const wrapper = document.createElement('div');
    wrapper.className = 'field-group';

    const labelElement = document.createElement('label');
    labelElement.textContent = label;

    wrapper.appendChild(labelElement);
    wrapper.appendChild(input);
    return wrapper;
  }

  function renderEnvironmentDetails() {
    refs.details.innerHTML = '';

    const selected = getSelectedEnvironment();
    if (!selected) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Select an environment to edit details.';
      refs.details.appendChild(empty);
      return;
    }

    const header = document.createElement('div');
    header.className = 'details-header';

    const title = document.createElement('h3');
    title.textContent = 'Environment Details';

    const activeButton = document.createElement('button');
    activeButton.type = 'button';
    activeButton.className = selected.id === state.activeEnvironmentId ? 'secondary-btn' : 'primary-btn';
    activeButton.textContent = selected.id === state.activeEnvironmentId ? 'Active Environment' : 'Set Active';
    activeButton.disabled = selected.id === state.activeEnvironmentId;
    activeButton.addEventListener('click', () => {
      state.activeEnvironmentId = selected.id;
      vscode.postMessage({ type: 'setActiveEnvironment', payload: { id: selected.id } });
      render();
    });

    header.appendChild(title);
    header.appendChild(activeButton);

    const fieldGrid = document.createElement('div');
    fieldGrid.className = 'field-grid';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = selected.name;
    nameInput.placeholder = 'Environment name';
    nameInput.addEventListener('input', () => {
      selected.name = nameInput.value;
      markEnvironmentUpdated(selected);
      persist();
      renderEnvironmentList();
    });

    const baseUrlInput = document.createElement('input');
    baseUrlInput.type = 'text';
    baseUrlInput.value = selected.baseUrl || '';
    baseUrlInput.placeholder = 'https://api.example.com';
    baseUrlInput.addEventListener('input', () => {
      selected.baseUrl = baseUrlInput.value;
      markEnvironmentUpdated(selected);
      persist();
    });

    const descriptionInput = document.createElement('textarea');
    descriptionInput.value = selected.description || '';
    descriptionInput.placeholder = 'Optional description';
    descriptionInput.addEventListener('input', () => {
      selected.description = descriptionInput.value;
      markEnvironmentUpdated(selected);
      persist();
    });

    fieldGrid.appendChild(createField('Name', nameInput));
    fieldGrid.appendChild(createField('Base URL', baseUrlInput));
    fieldGrid.appendChild(createField('Description', descriptionInput));

    const variablesHeader = document.createElement('div');
    variablesHeader.className = 'variables-header';

    const variablesTitle = document.createElement('h4');
    variablesTitle.textContent = 'Variables';

    const addVariableButton = document.createElement('button');
    addVariableButton.className = 'primary-btn';
    addVariableButton.type = 'button';
    addVariableButton.textContent = '+ Add Variable';
    addVariableButton.addEventListener('click', () => {
      selected.variables.push({
        key: '',
        value: '',
        description: '',
        isSecret: false,
        type: 'text'
      });
      markEnvironmentUpdated(selected);
      persist();
      renderEnvironmentDetails();
    });

    variablesHeader.appendChild(variablesTitle);
    variablesHeader.appendChild(addVariableButton);

    const table = document.createElement('table');
    table.className = 'variables-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Key</th>
          <th>Value</th>
          <th>Type</th>
          <th>Description</th>
          <th>Secret</th>
          <th></th>
        </tr>
      </thead>
    `;

    const body = document.createElement('tbody');

    selected.variables.forEach((variable, index) => {
      const row = document.createElement('tr');

      const keyCell = document.createElement('td');
      const keyInput = document.createElement('input');
      keyInput.type = 'text';
      keyInput.value = variable.key;
      keyInput.placeholder = 'variableName';
      keyInput.addEventListener('input', () => {
        variable.key = keyInput.value;
        markEnvironmentUpdated(selected);
        persist();
      });
      keyCell.appendChild(keyInput);

      const valueCell = document.createElement('td');
      const valueInput = document.createElement('input');
      valueInput.type = variable.isSecret || variable.type === 'secret' ? 'password' : 'text';
      valueInput.value = variable.value;
      valueInput.placeholder = 'value';
      valueInput.addEventListener('input', () => {
        variable.value = valueInput.value;
        markEnvironmentUpdated(selected);
        persist();
      });
      valueCell.appendChild(valueInput);

      const typeCell = document.createElement('td');
      const typeSelect = document.createElement('select');
      ['text', 'secret', 'url'].forEach((type) => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        option.selected = normalizeType(variable.type) === type;
        typeSelect.appendChild(option);
      });
      typeSelect.addEventListener('change', () => {
        variable.type = normalizeType(typeSelect.value);
        if (variable.type === 'secret') {
          variable.isSecret = true;
        }
        markEnvironmentUpdated(selected);
        persist();
        renderEnvironmentDetails();
      });
      typeCell.appendChild(typeSelect);

      const descriptionCell = document.createElement('td');
      const descriptionInput = document.createElement('input');
      descriptionInput.type = 'text';
      descriptionInput.value = variable.description || '';
      descriptionInput.placeholder = 'Optional description';
      descriptionInput.addEventListener('input', () => {
        variable.description = descriptionInput.value;
        markEnvironmentUpdated(selected);
        persist();
      });
      descriptionCell.appendChild(descriptionInput);

      const secretCell = document.createElement('td');
      const secretCheckbox = document.createElement('input');
      secretCheckbox.type = 'checkbox';
      secretCheckbox.checked = Boolean(variable.isSecret) || normalizeType(variable.type) === 'secret';
      secretCheckbox.addEventListener('change', () => {
        variable.isSecret = secretCheckbox.checked;
        if (secretCheckbox.checked) {
          variable.type = 'secret';
        } else if (normalizeType(variable.type) === 'secret') {
          variable.type = 'text';
        }
        markEnvironmentUpdated(selected);
        persist();
        renderEnvironmentDetails();
      });
      secretCell.appendChild(secretCheckbox);

      const deleteCell = document.createElement('td');
      const deleteButton = document.createElement('button');
      deleteButton.className = 'icon-btn';
      deleteButton.type = 'button';
      deleteButton.textContent = '✕';
      deleteButton.title = 'Delete variable';
      deleteButton.addEventListener('click', async () => {
        const confirmed = await confirmDialog(
          'Delete variable?',
          `This will remove "${variable.key || 'variable'}" from ${selected.name}.`,
          'Delete'
        );
        if (!confirmed) {
          return;
        }
        selected.variables.splice(index, 1);
        markEnvironmentUpdated(selected);
        persist();
        renderEnvironmentDetails();
      });
      deleteCell.appendChild(deleteButton);

      row.appendChild(keyCell);
      row.appendChild(valueCell);
      row.appendChild(typeCell);
      row.appendChild(descriptionCell);
      row.appendChild(secretCell);
      row.appendChild(deleteCell);
      body.appendChild(row);
    });

    table.appendChild(body);

    if (selected.variables.length === 0) {
      const variablesEmpty = document.createElement('div');
      variablesEmpty.className = 'empty-state';
      variablesEmpty.textContent = 'No variables yet. Add your first variable.';
      refs.details.appendChild(header);
      refs.details.appendChild(fieldGrid);
      refs.details.appendChild(variablesHeader);
      refs.details.appendChild(variablesEmpty);
      return;
    }

    refs.details.appendChild(header);
    refs.details.appendChild(fieldGrid);
    refs.details.appendChild(variablesHeader);
    refs.details.appendChild(table);
  }

  function render() {
    ensureValidSelection();
    renderEnvironmentList();
    renderEnvironmentDetails();
  }

  function addEnvironment() {
    const now = new Date().toISOString();
    const environment = {
      id: generateEnvironmentId(),
      name: generateUniqueName('New Environment'),
      baseUrl: '',
      description: '',
      variables: [],
      createdAt: now,
      updatedAt: now
    };
    state.environments.push(environment);
    state.selectedEnvironmentId = environment.id;
    persist();
    render();
  }

  function duplicateEnvironment(environmentId) {
    const environment = state.environments.find((item) => item.id === environmentId);
    if (!environment) {
      return;
    }

    const now = new Date().toISOString();
    const duplicated = normalizeEnvironment({
      ...environment,
      id: generateEnvironmentId(),
      name: generateUniqueName(`${environment.name} Copy`),
      createdAt: now,
      updatedAt: now,
      variables: environment.variables.map((variable) => ({ ...variable }))
    });

    state.environments.push(duplicated);
    state.selectedEnvironmentId = duplicated.id;
    persist();
    render();
  }

  async function deleteEnvironment(environmentId) {
    const environment = state.environments.find((item) => item.id === environmentId);
    if (!environment) {
      return;
    }

    const confirmed = await confirmDialog(
      'Delete environment?',
      `This will permanently remove "${environment.name}" and all its variables.`,
      'Delete'
    );

    if (!confirmed) {
      return;
    }

    state.environments = state.environments.filter((item) => item.id !== environmentId);

    if (state.activeEnvironmentId === environmentId) {
      state.activeEnvironmentId = undefined;
      vscode.postMessage({ type: 'setActiveEnvironment', payload: { id: undefined } });
    }

    ensureValidSelection();
    persist();
    render();
  }

  function bindToolbarEvents() {
    refs.addEnvironment.addEventListener('click', addEnvironment);

    refs.importEnvironment.addEventListener('click', () => {
      vscode.postMessage({ type: 'requestImportEnvironment' });
    });

    refs.exportEnvironment.addEventListener('click', () => {
      const selected = getSelectedEnvironment();
      if (!selected) {
        return;
      }
      vscode.postMessage({
        type: 'requestExportEnvironment',
        payload: {
          environment: selected
        }
      });
    });
  }

  function handleIncomingMessage(event) {
    const message = event.data;
    if (!message || typeof message.type !== 'string') {
      return;
    }

    if (message.type === 'documentUpdated') {
      const payload = message.payload || {};
      const incoming = Array.isArray(payload.environments) ? payload.environments : [];
      state.environments = incoming.map((environment) => normalizeEnvironment(environment));
      state.activeEnvironmentId = typeof payload.activeEnvironmentId === 'string'
        ? payload.activeEnvironmentId
        : undefined;
      ensureValidSelection();
      render();
      return;
    }

    if (message.type === 'activeEnvironmentChanged') {
      const payload = message.payload || {};
      state.activeEnvironmentId = typeof payload.activeEnvironmentId === 'string'
        ? payload.activeEnvironmentId
        : undefined;
      render();
    }
  }

  function init() {
    bindToolbarEvents();
    window.addEventListener('message', handleIncomingMessage);
    vscode.postMessage({ type: 'ready' });
  }

  init();
})();
