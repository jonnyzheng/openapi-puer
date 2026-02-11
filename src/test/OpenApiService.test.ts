import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { OpenApiService } from '../services/OpenApiService';

suite('OpenApiService Test Suite', () => {
  let service: OpenApiService;
  let tempDir: string;
  let testFilePath: string;

  setup(() => {
    service = new OpenApiService();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-puer-test-'));
    testFilePath = path.join(tempDir, 'test-api.json');
  });

  teardown(() => {
    service.dispose();
    // Clean up temp files
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir);
    }
  });

  suite('updatePath', () => {
    test('should successfully update path when new path does not exist', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: { summary: 'Get users', responses: { '200': { description: 'OK' } } }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updatePath(testFilePath, '/users', '/customers', 'get');

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.ok(updatedSpec.paths['/customers']);
      assert.ok(updatedSpec.paths['/customers'].get);
      assert.strictEqual(updatedSpec.paths['/users'], undefined);
    });

    test('should fail when old path does not exist', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: { summary: 'Get users', responses: { '200': { description: 'OK' } } }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updatePath(testFilePath, '/nonexistent', '/customers', 'get');

      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes('not found'));
    });

    test('should fail when method does not exist on old path', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: { summary: 'Get users', responses: { '200': { description: 'OK' } } }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updatePath(testFilePath, '/users', '/customers', 'post');

      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes('Method'));
      assert.ok(result.message?.includes('not found'));
    });

    test('should fail when Method+Path combination already exists', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: { summary: 'Get users', responses: { '200': { description: 'OK' } } }
          },
          '/customers': {
            get: { summary: 'Get customers', responses: { '200': { description: 'OK' } } }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updatePath(testFilePath, '/users', '/customers', 'get');

      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes('GET /customers'));
      assert.ok(result.message?.includes('already exists'));
    });

    test('should allow moving to existing path with different method', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: { summary: 'Get users', responses: { '200': { description: 'OK' } } }
          },
          '/customers': {
            post: { summary: 'Create customer', responses: { '201': { description: 'Created' } } }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      // Move GET /users to GET /customers (POST /customers already exists, but GET doesn't)
      const result = await service.updatePath(testFilePath, '/users', '/customers', 'get');

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.ok(updatedSpec.paths['/customers'].get);
      assert.ok(updatedSpec.paths['/customers'].post);
      assert.strictEqual(updatedSpec.paths['/users'], undefined);
    });

    test('should keep other methods on old path when moving one method', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: { summary: 'Get users', responses: { '200': { description: 'OK' } } },
            post: { summary: 'Create user', responses: { '201': { description: 'Created' } } }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      // Move only GET /users to /customers, POST /users should remain
      const result = await service.updatePath(testFilePath, '/users', '/customers', 'get');

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.ok(updatedSpec.paths['/customers'].get);
      assert.ok(updatedSpec.paths['/users'].post);
      assert.strictEqual(updatedSpec.paths['/users'].get, undefined);
    });

    test('should succeed when path is unchanged (same old and new path)', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: { summary: 'Get users', responses: { '200': { description: 'OK' } } }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updatePath(testFilePath, '/users', '/users', 'get');

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.ok(updatedSpec.paths['/users'].get);
    });

    test('should handle case-insensitive method matching', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: { summary: 'Get users', responses: { '200': { description: 'OK' } } }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      // Use uppercase method
      const result = await service.updatePath(testFilePath, '/users', '/customers', 'GET');

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.ok(updatedSpec.paths['/customers'].get);
    });
  });
});
