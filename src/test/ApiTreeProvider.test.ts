import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { OpenAPI } from 'openapi-types';
import { ApiFile } from '../models/types';
import { ApiTreeProvider } from '../providers/ApiTreeProvider';

suite('ApiTreeProvider Test Suite', () => {
  let tempDir: string;
  let provider: ApiTreeProvider;

  const createApiFile = (filePath: string, overrides: Partial<ApiFile> = {}): ApiFile => ({
    filePath,
    fileName: path.basename(filePath),
    spec: {} as OpenAPI.Document,
    endpoints: [],
    version: '3.1',
    ...overrides
  });

  setup(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-puer-tree-test-'));
    provider = new ApiTreeProvider();
    provider.setApiDirectory(tempDir);
    provider.setApiFolderConfigured(true);
  });

  teardown(() => {
    provider.dispose();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('should display real file names with extensions and sort by file name', async () => {
    const aFile = createApiFile(path.join(tempDir, 'a.json'), { title: 'z-title' });
    const bFile = createApiFile(path.join(tempDir, 'b.json'), { title: 'a-title' });

    provider.setApiFiles([bFile, aFile]);

    const items = await provider.getChildren();
    const labels = items
      .filter((item) => item.itemType === 'file' && !!item.apiFile)
      .map((item) => String(item.label));

    assert.deepStrictEqual(labels, ['a.json', 'b.json']);
  });

  test('should show warning icon and error context for parse-failed files', async () => {
    const brokenFile = createApiFile(path.join(tempDir, 'broken.json'), {
      parseError: 'Invalid JSON'
    });

    provider.setApiFiles([brokenFile]);

    const items = await provider.getChildren();
    const brokenItem = items.find((item) => String(item.label) === 'broken.json');

    assert.ok(brokenItem);
    assert.strictEqual(brokenItem?.contextValue, 'file-error');
    assert.strictEqual(brokenItem?.command?.command, 'vscode.open');
    assert.ok(typeof brokenItem?.tooltip === 'string' && brokenItem.tooltip.includes('Invalid JSON'));
    assert.ok(brokenItem?.iconPath instanceof vscode.ThemeIcon);
    if (brokenItem?.iconPath instanceof vscode.ThemeIcon) {
      assert.strictEqual(brokenItem.iconPath.id, 'warning');
    }
  });
});
