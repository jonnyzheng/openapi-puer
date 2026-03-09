import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Environment } from '../models/types';
import { EnvironmentEditorProvider } from '../panels/EnvironmentEditorProvider';
import { EnvironmentService } from '../services/EnvironmentService';

type EnvironmentEditorProviderInternals = {
  updateTextDocument(document: vscode.TextDocument, environments: Environment[]): Promise<void>;
};

suite('EnvironmentEditorProvider Test Suite', () => {
  let tempDir: string;
  let environmentsFilePath: string;
  let provider: EnvironmentEditorProvider;

  setup(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-puer-environment-editor-test-'));
    environmentsFilePath = path.join(tempDir, 'environments.json');
    fs.writeFileSync(environmentsFilePath, JSON.stringify({ environments: [] }, null, 2), 'utf-8');

    provider = new EnvironmentEditorProvider(
      { extensionUri: vscode.Uri.file(tempDir) } as unknown as vscode.ExtensionContext,
      {} as unknown as EnvironmentService
    );
  });

  teardown(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('updateTextDocument persists baseUrl changes to disk', async () => {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(environmentsFilePath));
    const now = new Date().toISOString();
    const nextEnvironments: Environment[] = [
      {
        id: 'env_default',
        name: 'Default',
        baseUrl: 'https://dev.example.com',
        description: 'Dev environment',
        variables: [],
        createdAt: now,
        updatedAt: now
      }
    ];

    const internals = provider as unknown as EnvironmentEditorProviderInternals;
    await internals.updateTextDocument(document, nextEnvironments);

    const persisted = JSON.parse(fs.readFileSync(environmentsFilePath, 'utf-8')) as { environments: Environment[] };
    assert.strictEqual(persisted.environments.length, 1);
    assert.strictEqual(persisted.environments[0].baseUrl, 'https://dev.example.com');
    assert.strictEqual(document.isDirty, false);
  });
});
