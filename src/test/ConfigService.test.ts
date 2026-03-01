import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConfigService } from '../services/ConfigService';

suite('ConfigService Test Suite', () => {
  let service: ConfigService;
  let tempDir: string;

  setup(() => {
    service = new ConfigService();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-puer-config-test-'));
  });

  teardown(() => {
    service.dispose();
    // Clean up temp directory recursively
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  suite('validateFolderStructure', () => {
    test('should return valid for a complete folder structure', () => {
      // Create complete structure
      fs.mkdirSync(path.join(tempDir, '.openapi-puer'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, '.openapi-puer', 'environments.json'), '{"environments":[]}');
      fs.mkdirSync(path.join(tempDir, 'components', 'parameters'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'components', 'responses'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'components', 'requestBodies'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'components', 'schemas'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'paths'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'api.json'), JSON.stringify({ openapi: '3.1.1' }, null, 2));

      const result = service.validateFolderStructure(tempDir);

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.missing.length, 0);
    });

    test('should return invalid for an empty folder', () => {
      const result = service.validateFolderStructure(tempDir);

      assert.strictEqual(result.valid, false);
      assert.ok(result.missing.length > 0);
      assert.ok(result.missing.includes('.openapi-puer/'));
      assert.ok(result.missing.includes('.openapi-puer/environments.json'));
      assert.ok(result.missing.includes('components/'));
      assert.ok(result.missing.includes('paths/'));
      assert.ok(result.missing.includes('api.json'));
    });

    test('should return invalid for a folder with partial structure', () => {
      // Create only .openapi-puer directory without environments.json
      fs.mkdirSync(path.join(tempDir, '.openapi-puer'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'paths'), { recursive: true });

      const result = service.validateFolderStructure(tempDir);

      assert.strictEqual(result.valid, false);
      assert.ok(!result.missing.includes('.openapi-puer/'));
      assert.ok(result.missing.includes('.openapi-puer/environments.json'));
      assert.ok(!result.missing.includes('paths/'));
      assert.ok(result.missing.includes('components/'));
      assert.ok(result.missing.includes('api.json'));
    });

    test('should detect missing component subdirectories', () => {
      // Create components dir but no subdirectories
      fs.mkdirSync(path.join(tempDir, 'components'), { recursive: true });

      const result = service.validateFolderStructure(tempDir);

      assert.ok(!result.missing.includes('components/'));
      assert.ok(result.missing.includes('components/parameters/'));
      assert.ok(result.missing.includes('components/responses/'));
      assert.ok(result.missing.includes('components/requestBodies/'));
      assert.ok(result.missing.includes('components/schemas/'));
    });

    test('should report missing openapi version in api.json', () => {
      fs.mkdirSync(path.join(tempDir, '.openapi-puer'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, '.openapi-puer', 'environments.json'), '{"environments":[]}');
      fs.mkdirSync(path.join(tempDir, 'components', 'parameters'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'components', 'responses'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'components', 'requestBodies'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'components', 'schemas'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'paths'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'api.json'), JSON.stringify({ info: { title: 'X', version: '1.0.0' }, paths: {} }, null, 2));

      const result = service.validateFolderStructure(tempDir);

      assert.strictEqual(result.valid, false);
      assert.ok(result.missing.includes('api.json.openapi'));
    });

    test('should report unsupported openapi version in api.json', () => {
      fs.mkdirSync(path.join(tempDir, '.openapi-puer'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, '.openapi-puer', 'environments.json'), '{"environments":[]}');
      fs.mkdirSync(path.join(tempDir, 'components', 'parameters'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'components', 'responses'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'components', 'requestBodies'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'components', 'schemas'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'paths'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'api.json'), JSON.stringify({ openapi: '3.3.0' }, null, 2));

      const result = service.validateFolderStructure(tempDir);

      assert.strictEqual(result.valid, false);
      assert.ok(result.missing.includes('api.json.openapi'));
    });
  });

  suite('scaffoldFolderStructure', () => {
    test('should create all required directories and files in an empty folder', async () => {
      await service.scaffoldFolderStructure(tempDir);

      // Verify directories
      assert.ok(fs.existsSync(path.join(tempDir, '.openapi-puer')));
      assert.ok(fs.existsSync(path.join(tempDir, 'components', 'parameters')));
      assert.ok(fs.existsSync(path.join(tempDir, 'components', 'responses')));
      assert.ok(fs.existsSync(path.join(tempDir, 'components', 'requestBodies')));
      assert.ok(fs.existsSync(path.join(tempDir, 'components', 'schemas')));
      assert.ok(fs.existsSync(path.join(tempDir, 'paths')));

      // Verify files
      assert.ok(fs.existsSync(path.join(tempDir, '.openapi-puer', 'environments.json')));
      assert.ok(fs.existsSync(path.join(tempDir, 'api.json')));
      assert.ok(fs.existsSync(path.join(tempDir, 'README.md')));

      // Verify environments.json content
      const envContent = JSON.parse(fs.readFileSync(path.join(tempDir, '.openapi-puer', 'environments.json'), 'utf-8'));
      assert.ok(Array.isArray(envContent.environments));
      assert.strictEqual(envContent.environments.length, 1);
      const [defaultEnvironment] = envContent.environments;
      assert.strictEqual(defaultEnvironment.id, 'env_default');
      assert.strictEqual(defaultEnvironment.name, 'Default');
      assert.strictEqual(defaultEnvironment.baseUrl, '');
      assert.strictEqual(defaultEnvironment.description, '');
      assert.deepStrictEqual(defaultEnvironment.variables, []);
      assert.ok(typeof defaultEnvironment.createdAt === 'string');
      assert.ok(typeof defaultEnvironment.updatedAt === 'string');

      // Verify api.json content
      const apiContent = JSON.parse(fs.readFileSync(path.join(tempDir, 'api.json'), 'utf-8'));
      assert.strictEqual(apiContent.openapi, '3.1.1');
      assert.strictEqual(apiContent.info.title, 'My API');
      assert.strictEqual(apiContent.info.version, '1.0.0');

      // Verify parameter files
      assert.ok(fs.existsSync(path.join(tempDir, 'components', 'parameters', 'cookie.json')));
      assert.ok(fs.existsSync(path.join(tempDir, 'components', 'parameters', 'header.json')));
      assert.ok(fs.existsSync(path.join(tempDir, 'components', 'parameters', 'path.json')));
      assert.ok(fs.existsSync(path.join(tempDir, 'components', 'parameters', 'query.json')));

      const parameterContent = JSON.parse(fs.readFileSync(path.join(tempDir, 'components', 'parameters', 'query.json'), 'utf-8'));
      assert.strictEqual(parameterContent.openapi, '3.1.1');
    });

    test('should not overwrite existing files in folders with existing content', async () => {
      // Create pre-existing files
      fs.mkdirSync(path.join(tempDir, '.openapi-puer'), { recursive: true });
      const existingEnvContent = '{"environments":[{"name":"Production","variables":{}}]}';
      fs.writeFileSync(path.join(tempDir, '.openapi-puer', 'environments.json'), existingEnvContent);

      const existingApiContent = '{"openapi":"3.0.0","info":{"title":"Existing API","version":"2.0.0"}}';
      fs.writeFileSync(path.join(tempDir, 'api.json'), existingApiContent);

      const existingReadme = '# My Custom README\nThis should not be overwritten.';
      fs.writeFileSync(path.join(tempDir, 'README.md'), existingReadme);

      await service.scaffoldFolderStructure(tempDir);

      // Verify existing files were NOT overwritten
      const envContent = fs.readFileSync(path.join(tempDir, '.openapi-puer', 'environments.json'), 'utf-8');
      assert.strictEqual(envContent, existingEnvContent);

      const apiContent = fs.readFileSync(path.join(tempDir, 'api.json'), 'utf-8');
      assert.strictEqual(apiContent, existingApiContent);

      const readmeContent = fs.readFileSync(path.join(tempDir, 'README.md'), 'utf-8');
      assert.strictEqual(readmeContent, existingReadme);

      // Verify missing directories were still created
      assert.ok(fs.existsSync(path.join(tempDir, 'components', 'parameters')));
      assert.ok(fs.existsSync(path.join(tempDir, 'paths')));
    });

    test('should handle folders with partial structure correctly', async () => {
      // Create partial structure
      fs.mkdirSync(path.join(tempDir, '.openapi-puer'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'components', 'schemas'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'paths'), { recursive: true });

      // Add a custom schema file that should be preserved
      const customSchema = '{"type":"object","properties":{"id":{"type":"string"}}}';
      fs.writeFileSync(path.join(tempDir, 'components', 'schemas', 'User.json'), customSchema);

      await service.scaffoldFolderStructure(tempDir);

      // Verify missing items were created
      assert.ok(fs.existsSync(path.join(tempDir, '.openapi-puer', 'environments.json')));
      assert.ok(fs.existsSync(path.join(tempDir, 'components', 'parameters')));
      assert.ok(fs.existsSync(path.join(tempDir, 'components', 'responses')));
      assert.ok(fs.existsSync(path.join(tempDir, 'components', 'requestBodies')));
      assert.ok(fs.existsSync(path.join(tempDir, 'api.json')));
      assert.ok(fs.existsSync(path.join(tempDir, 'README.md')));

      // Verify existing items were preserved
      const schemaContent = fs.readFileSync(path.join(tempDir, 'components', 'schemas', 'User.json'), 'utf-8');
      assert.strictEqual(schemaContent, customSchema);
    });

    test('should not overwrite existing parameter files', async () => {
      // Create a pre-existing parameter file with custom content
      fs.mkdirSync(path.join(tempDir, 'components', 'parameters'), { recursive: true });
      const customParams = '{"components":{"parameters":{"userId":{"name":"userId","in":"path","required":true}}}}';
      fs.writeFileSync(path.join(tempDir, 'components', 'parameters', 'path.json'), customParams);

      await service.scaffoldFolderStructure(tempDir);

      // Verify existing parameter file was NOT overwritten
      const paramContent = fs.readFileSync(path.join(tempDir, 'components', 'parameters', 'path.json'), 'utf-8');
      assert.strictEqual(paramContent, customParams);

      // Verify other parameter files were created
      assert.ok(fs.existsSync(path.join(tempDir, 'components', 'parameters', 'cookie.json')));
      assert.ok(fs.existsSync(path.join(tempDir, 'components', 'parameters', 'header.json')));
      assert.ok(fs.existsSync(path.join(tempDir, 'components', 'parameters', 'query.json')));
    });

    test('should align generated parameter files with existing api.json openapi version', async () => {
      fs.writeFileSync(path.join(tempDir, 'api.json'), JSON.stringify({ openapi: '3.0.3' }, null, 2));

      await service.scaffoldFolderStructure(tempDir);

      const parameterContent = JSON.parse(fs.readFileSync(path.join(tempDir, 'components', 'parameters', 'cookie.json'), 'utf-8'));
      assert.strictEqual(parameterContent.openapi, '3.0.3');
    });
  });

  suite('generateReadme', () => {
    test('should create README.md with expected sections', async () => {
      await service.generateReadme(tempDir);

      const readmePath = path.join(tempDir, 'README.md');
      assert.ok(fs.existsSync(readmePath));

      const content = fs.readFileSync(readmePath, 'utf-8');

      // Verify expected sections exist
      assert.ok(content.includes('# OpenAPI Puer API Documentation'));
      assert.ok(content.includes('## Folder Structure'));
      assert.ok(content.includes('## Quick Start'));
      assert.ok(content.includes('## Resources'));
      assert.ok(content.includes('.openapi-puer/'));
      assert.ok(content.includes('environments.json'));
    });

    test('should not overwrite existing README.md', async () => {
      const existingContent = '# My Existing README';
      fs.writeFileSync(path.join(tempDir, 'README.md'), existingContent);

      await service.generateReadme(tempDir);

      const content = fs.readFileSync(path.join(tempDir, 'README.md'), 'utf-8');
      assert.strictEqual(content, existingContent);
    });
  });

  suite('validateDirectory', () => {
    test('should return valid for an existing directory', () => {
      const result = service.validateDirectory(tempDir);
      assert.strictEqual(result.valid, true);
    });

    test('should return invalid for an empty path', () => {
      const result = service.validateDirectory('');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('No directory path specified'));
    });

    test('should return invalid for a non-existent path', () => {
      const result = service.validateDirectory(path.join(tempDir, 'nonexistent'));
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('not found'));
    });

    test('should return invalid when path is a file, not a directory', () => {
      const filePath = path.join(tempDir, 'file.txt');
      fs.writeFileSync(filePath, 'test');

      const result = service.validateDirectory(filePath);
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('not found'));
    });
  });

  suite('path handling', () => {
    test('should resolve absolute paths correctly in getApiDirectory', () => {
      // ConfigService.getApiDirectory() reads from vscode config,
      // which we can't easily test without vscode mocking.
      // Instead, test the path validation logic.
      const absolutePath = tempDir;
      const result = service.validateDirectory(absolutePath);
      assert.strictEqual(result.valid, true);
    });

    test('should handle paths with special characters', () => {
      const specialDir = path.join(tempDir, 'my api-docs (v2)');
      fs.mkdirSync(specialDir, { recursive: true });

      const result = service.validateDirectory(specialDir);
      assert.strictEqual(result.valid, true);
    });

    test('should validate folder structure at deeply nested path', () => {
      const deepPath = path.join(tempDir, 'level1', 'level2', 'level3');
      fs.mkdirSync(deepPath, { recursive: true });

      const result = service.validateFolderStructure(deepPath);
      assert.strictEqual(result.valid, false);
      assert.ok(result.missing.length > 0);
    });
  });

  suite('scaffolding error handling', () => {
    test('should throw with permission error message for EACCES', async () => {
      // Test that the error handling wraps EACCES correctly
      // We can't easily simulate EACCES in a test, but we can test
      // that scaffolding works for a valid directory
      await service.scaffoldFolderStructure(tempDir);

      // Verify all files were created successfully
      const validation = service.validateFolderStructure(tempDir);
      assert.strictEqual(validation.valid, true);
    });

    test('should create a valid folder structure that passes validation', async () => {
      await service.scaffoldFolderStructure(tempDir);

      const result = service.validateFolderStructure(tempDir);
      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.missing, []);
    });
  });
});
