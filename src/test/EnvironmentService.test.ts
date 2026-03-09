import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { EnvironmentService } from '../services/EnvironmentService';

function createMockMemento(): vscode.Memento {
  const store = new Map<string, unknown>();
  return {
    get<T>(key: string, defaultValue?: T): T {
      return store.has(key) ? (store.get(key) as T) : (defaultValue as T);
    },
    update(key: string, value: unknown): Thenable<void> {
      store.set(key, value);
      return Promise.resolve();
    },
    keys(): readonly string[] {
      return Array.from(store.keys());
    }
  };
}

function createMockSecretStorage(): vscode.SecretStorage {
  const secrets = new Map<string, string>();
  const changeEmitter = new vscode.EventEmitter<vscode.SecretStorageChangeEvent>();

  return {
    get(key: string): Thenable<string | undefined> {
      return Promise.resolve(secrets.get(key));
    },
    keys(): Thenable<string[]> {
      return Promise.resolve(Array.from(secrets.keys()));
    },
    store(key: string, value: string): Thenable<void> {
      secrets.set(key, value);
      changeEmitter.fire({ key });
      return Promise.resolve();
    },
    delete(key: string): Thenable<void> {
      secrets.delete(key);
      changeEmitter.fire({ key });
      return Promise.resolve();
    },
    onDidChange: changeEmitter.event
  };
}

suite('EnvironmentService Test Suite', () => {
  let tempDir: string;
  let workspaceFolderDescriptor: PropertyDescriptor | undefined;

  setup(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-puer-env-test-'));

    workspaceFolderDescriptor = Object.getOwnPropertyDescriptor(vscode.workspace, 'workspaceFolders');
    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
      configurable: true,
      value: [{ uri: vscode.Uri.file(tempDir) }]
    });
  });

  teardown(() => {
    if (workspaceFolderDescriptor) {
      Object.defineProperty(vscode.workspace, 'workspaceFolders', workspaceFolderDescriptor);
    }

    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createService(): EnvironmentService {
    const context = {
      workspaceState: createMockMemento(),
      secrets: createMockSecretStorage()
    } as unknown as vscode.ExtensionContext;
    return new EnvironmentService(context);
  }

  test('loads legacy environments and applies default new fields', () => {
    const openapiPuerDir = path.join(tempDir, '.openapi-puer');
    fs.mkdirSync(openapiPuerDir, { recursive: true });
    fs.writeFileSync(
      path.join(openapiPuerDir, 'environments.json'),
      JSON.stringify([
        {
          id: 'legacy',
          name: 'Legacy',
          variables: [{ key: 'host', value: 'localhost' }],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ]),
      'utf-8'
    );

    const service = createService();
    const [environment] = service.getEnvironments();

    assert.ok(environment);
    assert.strictEqual(environment.baseUrl, '');
    assert.strictEqual(environment.description, '');
    assert.strictEqual(environment.variables[0].type, 'text');

    service.dispose();
  });

  test('setEnvironments persists secret values to secret storage and strips file values', async () => {
    const service = createService();

    await service.setEnvironments([
      {
        id: 'env_1',
        name: 'Dev',
        baseUrl: 'https://dev.example.com',
        description: 'Dev environment',
        variables: [
          { key: 'token', value: 'top-secret', isSecret: true, type: 'secret' },
          { key: 'host', value: 'dev.example.com', type: 'url' }
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      }
    ]);

    const environmentsFile = path.join(tempDir, '.openapi-puer', 'environments.json');
    const persisted = JSON.parse(fs.readFileSync(environmentsFile, 'utf-8'));
    const [persistedEnvironment] = persisted.environments;
    const [secretVariable] = persistedEnvironment.variables;

    assert.strictEqual(secretVariable.value, '');
    assert.strictEqual(secretVariable.type, 'secret');

    const variables = await service.getVariablesAsRecord('env_1');
    assert.strictEqual(variables.token, 'top-secret');
    assert.strictEqual(variables.host, 'dev.example.com');

    service.dispose();
  });

  test('import and export preserve baseUrl, description, and variable types', async () => {
    const service = createService();
    const imported = await service.importEnvironment(JSON.stringify({
      name: 'Imported',
      baseUrl: 'https://imported.example.com',
      description: 'Imported environment',
      variables: [
        {
          key: 'apiKey',
          value: 'secret-token',
          isSecret: true,
          type: 'secret'
        },
        {
          key: 'apiHost',
          value: 'imported.example.com',
          type: 'url'
        }
      ]
    }));

    assert.ok(imported);
    assert.strictEqual(imported?.baseUrl, 'https://imported.example.com');
    assert.strictEqual(imported?.description, 'Imported environment');
    assert.strictEqual(imported?.variables[0].type, 'secret');
    assert.strictEqual(imported?.variables[1].type, 'url');

    const exportedText = await service.exportEnvironment(imported!.id);
    assert.ok(exportedText);
    const exported = JSON.parse(exportedText!);

    assert.strictEqual(exported.baseUrl, 'https://imported.example.com');
    assert.strictEqual(exported.description, 'Imported environment');
    assert.strictEqual(exported.variables[0].type, 'secret');
    assert.strictEqual(exported.variables[0].value, '');
    assert.strictEqual(exported.variables[1].type, 'url');

    const variables = await service.getVariablesAsRecord(imported!.id);
    assert.strictEqual(variables.apiKey, 'secret-token');
    assert.strictEqual(variables.apiHost, 'imported.example.com');

    service.dispose();
  });
});
