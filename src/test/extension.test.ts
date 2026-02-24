import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('openapi-puer.openapi-puer'));
  });

  test('Extension should activate', async () => {
    const extension = vscode.extensions.getExtension('openapi-puer.openapi-puer');
    assert.ok(extension, 'Extension openapi-puer.openapi-puer should be present');

    await extension.activate();
    assert.ok(extension.isActive);
  });
});
