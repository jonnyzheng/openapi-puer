import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('jonnyzheng.openapi-puer'));
  });

  test('Extension should activate', async () => {
    const extension = vscode.extensions.getExtension('jonnyzheng.openapi-puer');
    assert.ok(extension, 'Extension jonnyzheng.openapi-puer should be present');

    await extension.activate();
    assert.ok(extension.isActive);
  });
});
