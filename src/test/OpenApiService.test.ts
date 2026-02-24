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

  suite('updateMethod', () => {
    test('should successfully update method when new method does not exist on path', async () => {
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

      const result = await service.updateMethod(testFilePath, '/users', 'get', 'post');

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.ok(updatedSpec.paths['/users'].post);
      assert.strictEqual(updatedSpec.paths['/users'].get, undefined);
    });

    test('should fail when path does not exist', async () => {
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

      const result = await service.updateMethod(testFilePath, '/customers', 'get', 'post');

      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes('Path /customers not found'));
    });

    test('should fail when old method does not exist on path', async () => {
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

      const result = await service.updateMethod(testFilePath, '/users', 'post', 'put');

      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes('Method post not found'));
    });

    test('should fail when new method already exists on path', async () => {
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

      const result = await service.updateMethod(testFilePath, '/users', 'get', 'post');

      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes('POST /users'));
      assert.ok(result.message?.includes('already exists'));
    });

    test('should succeed when method is unchanged (case-insensitive)', async () => {
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

      const result = await service.updateMethod(testFilePath, '/users', 'GET', 'get');

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.ok(updatedSpec.paths['/users'].get);
      assert.strictEqual(updatedSpec.paths['/users'].post, undefined);
    });
  });

  suite('addEndpoint', () => {
    test('should initialize paths object and add endpoint with default response', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.addEndpoint(testFilePath, '/users', 'get', 'Get users');

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.ok(updatedSpec.paths['/users'].get);
      assert.strictEqual(updatedSpec.paths['/users'].get.summary, 'Get users');
      assert.strictEqual(updatedSpec.paths['/users'].get.responses['200'].description, 'Successful response');
    });

    test('should fail when method and path combination already exists', async () => {
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

      const result = await service.addEndpoint(testFilePath, '/users', 'GET', 'Duplicate users');

      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes('GET /users already exists'));
    });

    test('should allow adding a different method to an existing path', async () => {
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

      const result = await service.addEndpoint(testFilePath, '/users', 'post', 'Create user');

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.ok(updatedSpec.paths['/users'].get);
      assert.ok(updatedSpec.paths['/users'].post);
      assert.strictEqual(updatedSpec.paths['/users'].post.summary, 'Create user');
    });

    test('should create operation without summary when summary is not provided', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {}
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.addEndpoint(testFilePath, '/health', 'get');

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.ok(updatedSpec.paths['/health'].get);
      assert.strictEqual(updatedSpec.paths['/health'].get.summary, undefined);
      assert.strictEqual(updatedSpec.paths['/health'].get.responses['200'].description, 'Successful response');
    });
  });

  suite('updateRequestBody', () => {
    test('should set request body for an existing operation', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              responses: {
                '201': { description: 'Created' }
              }
            }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' }
              }
            }
          }
        }
      };

      const result = await service.updateRequestBody(testFilePath, '/users', 'post', requestBody);

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.strictEqual(updatedSpec.paths['/users'].post.requestBody.required, true);
      assert.strictEqual(updatedSpec.paths['/users'].post.requestBody.content['application/json'].schema.type, 'object');
    });

    test('should remove request body when null is provided', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: { type: 'object' }
                  }
                }
              },
              responses: {
                '201': { description: 'Created' }
              }
            }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updateRequestBody(testFilePath, '/users', 'post', null);

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.strictEqual(updatedSpec.paths['/users'].post.requestBody, undefined);
    });

    test('should support case-insensitive method input', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              responses: {
                '201': { description: 'Created' }
              }
            }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updateRequestBody(testFilePath, '/users', 'POST', {
        content: {
          'application/json': {
            schema: { type: 'string' }
          }
        }
      });

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.strictEqual(updatedSpec.paths['/users'].post.requestBody.content['application/json'].schema.type, 'string');
    });

    test('should fail when path does not exist', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              responses: {
                '201': { description: 'Created' }
              }
            }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updateRequestBody(testFilePath, '/missing', 'post', {
        content: {
          'application/json': {
            schema: { type: 'object' }
          }
        }
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes('Path /missing not found in spec'));
    });

    test('should fail when method does not exist on the path', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': { description: 'OK' }
              }
            }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updateRequestBody(testFilePath, '/users', 'post', {
        content: {
          'application/json': {
            schema: { type: 'object' }
          }
        }
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes('Method post not found on path /users'));
    });
  });

  suite('addServer', () => {
    test('should initialize servers array and add server with description', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {}
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.addServer(testFilePath, {
        url: 'https://api.example.com',
        description: 'Production'
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.servers?.length, 1);
      assert.strictEqual(result.servers?.[0].url, 'https://api.example.com');
      assert.strictEqual(result.servers?.[0].description, 'Production');

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.strictEqual(updatedSpec.servers.length, 1);
      assert.strictEqual(updatedSpec.servers[0].url, 'https://api.example.com');
      assert.strictEqual(updatedSpec.servers[0].description, 'Production');
    });

    test('should fail when server URL already exists', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com', description: 'Production' }],
        paths: {}
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.addServer(testFilePath, {
        url: 'https://api.example.com',
        description: 'Duplicate'
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes('already exists'));
    });

    test('should add server without description when omitted', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [],
        paths: {}
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.addServer(testFilePath, {
        url: 'https://staging.example.com'
      });

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.strictEqual(updatedSpec.servers[0].url, 'https://staging.example.com');
      assert.strictEqual(updatedSpec.servers[0].description, undefined);
    });
  });

  suite('updateServer', () => {
    test('should update server at index', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [
          { url: 'http://localhost:3000', description: 'Local' },
          { url: 'https://api.example.com', description: 'Production' }
        ],
        paths: {}
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updateServer(testFilePath, 1, {
        url: 'https://new-api.example.com',
        description: 'Updated production'
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.servers?.[1].url, 'https://new-api.example.com');
      assert.strictEqual(result.servers?.[1].description, 'Updated production');

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.strictEqual(updatedSpec.servers[1].url, 'https://new-api.example.com');
      assert.strictEqual(updatedSpec.servers[1].description, 'Updated production');
    });

    test('should allow updating description while keeping the same URL', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com', description: 'Old description' }],
        paths: {}
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updateServer(testFilePath, 0, {
        url: 'https://api.example.com',
        description: 'Updated description'
      });

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.strictEqual(updatedSpec.servers[0].url, 'https://api.example.com');
      assert.strictEqual(updatedSpec.servers[0].description, 'Updated description');
    });

    test('should fail when server index is out of range', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {}
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updateServer(testFilePath, 2, {
        url: 'https://new-api.example.com'
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes('index 2'));
    });

    test('should fail when updated URL already exists on another server', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [
          { url: 'http://localhost:3000' },
          { url: 'https://api.example.com' }
        ],
        paths: {}
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updateServer(testFilePath, 1, {
        url: 'http://localhost:3000'
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes('already exists'));
    });

    test('should remove description when omitted in update', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com', description: 'Production' }],
        paths: {}
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updateServer(testFilePath, 0, {
        url: 'https://api2.example.com'
      });

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.strictEqual(updatedSpec.servers[0].url, 'https://api2.example.com');
      assert.strictEqual(updatedSpec.servers[0].description, undefined);
    });
  });

  suite('deleteServer', () => {
    test('should delete server at index and keep remaining servers', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [
          { url: 'http://localhost:3000', description: 'Local' },
          { url: 'https://api.example.com', description: 'Production' }
        ],
        paths: {}
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.deleteServer(testFilePath, 0);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.servers?.length, 1);
      assert.strictEqual(result.servers?.[0].url, 'https://api.example.com');

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.strictEqual(updatedSpec.servers.length, 1);
      assert.strictEqual(updatedSpec.servers[0].url, 'https://api.example.com');
    });

    test('should remove servers key when deleting the last server', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com', description: 'Production' }],
        paths: {}
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.deleteServer(testFilePath, 0);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.servers, []);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.strictEqual(updatedSpec.servers, undefined);
    });

    test('should fail when server index does not exist', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {}
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.deleteServer(testFilePath, 3);

      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes('not found'));
    });
  });

  suite('updateApiInfo', () => {
    test('should initialize info object when missing and apply updates', async () => {
      const spec = {
        openapi: '3.0.0',
        paths: {}
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updateApiInfo(testFilePath, {
        title: 'Updated API',
        description: 'Updated description',
        version: '2.0.0'
      });

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.strictEqual(updatedSpec.info.title, 'Updated API');
      assert.strictEqual(updatedSpec.info.description, 'Updated description');
      assert.strictEqual(updatedSpec.info.version, '2.0.0');
    });

    test('should update only provided fields and preserve others', async () => {
      const spec = {
        openapi: '3.0.0',
        info: {
          title: 'Original API',
          description: 'Original description',
          version: '1.0.0'
        },
        paths: {}
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updateApiInfo(testFilePath, {
        title: 'Renamed API'
      });

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.strictEqual(updatedSpec.info.title, 'Renamed API');
      assert.strictEqual(updatedSpec.info.description, 'Original description');
      assert.strictEqual(updatedSpec.info.version, '1.0.0');
    });

    test('should clear fields when empty strings are provided', async () => {
      const spec = {
        openapi: '3.0.0',
        info: {
          title: 'Original API',
          description: 'Original description',
          version: '1.0.0'
        },
        paths: {}
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updateApiInfo(testFilePath, {
        title: '',
        description: '',
        version: ''
      });

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.strictEqual(updatedSpec.info.title, undefined);
      assert.strictEqual(updatedSpec.info.description, undefined);
      assert.strictEqual(updatedSpec.info.version, undefined);
    });
  });

  suite('addResponse', () => {
    test('should initialize responses and add a response with default description', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            post: {}
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.addResponse(testFilePath, '/users', 'post', {
        statusCode: '201'
      });

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.strictEqual(updatedSpec.paths['/users'].post.responses['201'].description, 'Response for status 201');
    });

    test('should add response with content type and schema', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': { description: 'OK' }
              }
            }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.addResponse(testFilePath, '/users', 'get', {
        statusCode: '422',
        description: 'Validation error',
        contentType: 'application/json',
        schema: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      });

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.strictEqual(updatedSpec.paths['/users'].get.responses['422'].description, 'Validation error');
      assert.strictEqual(updatedSpec.paths['/users'].get.responses['422'].content['application/json'].schema.type, 'object');
      assert.ok(updatedSpec.paths['/users'].get.responses['422'].content['application/json'].schema.properties.error);
    });

    test('should use object schema when only content type is provided', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {}
            }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.addResponse(testFilePath, '/users', 'get', {
        statusCode: '202',
        contentType: 'application/json'
      });

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.strictEqual(updatedSpec.paths['/users'].get.responses['202'].content['application/json'].schema.type, 'object');
    });

    test('should fail when response status code already exists', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': { description: 'OK' }
              }
            }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.addResponse(testFilePath, '/users', 'get', {
        statusCode: '200'
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes('already exists'));
    });

    test('should fail when path does not exist', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: { responses: {} }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.addResponse(testFilePath, '/missing', 'get', {
        statusCode: '200'
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes('Path /missing not found'));
    });

    test('should fail when method does not exist on a valid path', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {}
            }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.addResponse(testFilePath, '/users', 'post', {
        statusCode: '201'
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes('Method post not found for path /users'));
    });
  });

  suite('updateResponse', () => {
    test('should update response description and schema', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: { type: 'object' }
                    }
                  }
                }
              }
            }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updateResponse(testFilePath, '/users', 'get', '200', {
        description: 'Updated OK',
        schema: { type: 'string' }
      });

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.strictEqual(updatedSpec.paths['/users'].get.responses['200'].description, 'Updated OK');
      assert.strictEqual(updatedSpec.paths['/users'].get.responses['200'].content['application/json'].schema.type, 'string');
    });

    test('should move content when content type changes', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: { type: 'object' }
                    }
                  }
                }
              }
            }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updateResponse(testFilePath, '/users', 'get', '200', {
        contentType: 'text/plain'
      });

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      const response = updatedSpec.paths['/users'].get.responses['200'];
      assert.ok(response.content['text/plain']);
      assert.strictEqual(response.content['application/json'], undefined);
      assert.strictEqual(response.content['text/plain'].schema.type, 'object');
    });

    test('should create default application/json content when updating schema without existing content', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': {
                  description: 'OK'
                }
              }
            }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updateResponse(testFilePath, '/users', 'get', '200', {
        schema: {
          type: 'array',
          items: {
            type: 'string'
          }
        }
      });

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.strictEqual(updatedSpec.paths['/users'].get.responses['200'].content['application/json'].schema.type, 'array');
      assert.strictEqual(updatedSpec.paths['/users'].get.responses['200'].content['application/json'].schema.items.type, 'string');
    });

    test('should set and clear headers', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': {
                  description: 'OK'
                }
              }
            }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const setHeadersResult = await service.updateResponse(testFilePath, '/users', 'get', '200', {
        headers: {
          'X-Trace': { description: 'Trace id' }
        }
      });

      assert.strictEqual(setHeadersResult.success, true);

      const withHeaders = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.ok(withHeaders.paths['/users'].get.responses['200'].headers['X-Trace']);

      const clearHeadersResult = await service.updateResponse(testFilePath, '/users', 'get', '200', {
        headers: {}
      });

      assert.strictEqual(clearHeadersResult.success, true);

      const withoutHeaders = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.strictEqual(withoutHeaders.paths['/users'].get.responses['200'].headers, undefined);
    });

    test('should set and clear examples', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: { type: 'object' }
                    }
                  }
                }
              }
            }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const setExamplesResult = await service.updateResponse(testFilePath, '/users', 'get', '200', {
        examples: {
          sample: {
            value: { ok: true }
          }
        }
      });

      assert.strictEqual(setExamplesResult.success, true);

      const withExamples = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.ok(withExamples.paths['/users'].get.responses['200'].content['application/json'].examples.sample);

      const clearExamplesResult = await service.updateResponse(testFilePath, '/users', 'get', '200', {
        examples: {}
      });

      assert.strictEqual(clearExamplesResult.success, true);

      const withoutExamples = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.strictEqual(withoutExamples.paths['/users'].get.responses['200'].content['application/json'].examples, undefined);
    });

    test('should rename response status code', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': { description: 'OK' },
                '404': { description: 'Not Found' }
              }
            }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updateResponse(testFilePath, '/users', 'get', '200', {
        statusCode: '201'
      });

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.strictEqual(updatedSpec.paths['/users'].get.responses['200'], undefined);
      assert.strictEqual(updatedSpec.paths['/users'].get.responses['201'].description, 'OK');
      assert.strictEqual(updatedSpec.paths['/users'].get.responses['404'].description, 'Not Found');
    });

    test('should fail when renaming to an existing status code', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': { description: 'OK' },
                '201': { description: 'Created' }
              }
            }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updateResponse(testFilePath, '/users', 'get', '200', {
        statusCode: '201'
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes('already exists'));
    });

    test('should fail when target response does not exist', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': { description: 'OK' }
              }
            }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updateResponse(testFilePath, '/users', 'get', '404', {
        description: 'Not Found'
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes('Response 404 not found'));
    });

    test('should fail when method does not exist on a valid path', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': {
                  description: 'OK'
                }
              }
            }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updateResponse(testFilePath, '/users', 'post', '200', {
        description: 'Created'
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes('Method post not found for path /users'));
    });
  });

  suite('deleteResponse', () => {
    test('should delete a response while keeping other responses', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': { description: 'OK' },
                '400': { description: 'Bad Request' }
              }
            }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.deleteResponse(testFilePath, '/users', 'get', '400');

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.strictEqual(updatedSpec.paths['/users'].get.responses['400'], undefined);
      assert.strictEqual(updatedSpec.paths['/users'].get.responses['200'].description, 'OK');
    });

    test('should create default 200 response when deleting the last response', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {
                '204': { description: 'No Content' }
              }
            }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.deleteResponse(testFilePath, '/users', 'get', '204');

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.strictEqual(updatedSpec.paths['/users'].get.responses['200'].description, 'Successful response');
    });

    test('should fail when response status code is not found', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': { description: 'OK' }
              }
            }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.deleteResponse(testFilePath, '/users', 'get', '404');

      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes('Response 404 not found'));
    });

    test('should fail when method does not exist on a valid path', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': { description: 'OK' }
              }
            }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.deleteResponse(testFilePath, '/users', 'post', '200');

      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes('Method post not found for path /users'));
    });
  });

  suite('updateResponseSource', () => {
    test('should add default description when source payload does not include one', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': { description: 'OK' }
              }
            }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updateResponseSource(testFilePath, '/users', 'get', '201', {
        content: {
          'application/json': {
            schema: { type: 'string' }
          }
        }
      });

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.strictEqual(updatedSpec.paths['/users'].get.responses['201'].description, 'Response for status 201');
      assert.strictEqual(updatedSpec.paths['/users'].get.responses['201'].content['application/json'].schema.type, 'string');
    });

    test('should replace response source using provided description', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': {
                  description: 'Old description',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object'
                      },
                      examples: {
                        old: {
                          value: {
                            stale: true
                          }
                        }
                      }
                    }
                  },
                  headers: {
                    'X-Old': {
                      description: 'stale header'
                    }
                  },
                  'x-old-field': true
                }
              }
            }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updateResponseSource(testFilePath, '/users', 'get', '200', {
        description: 'Accepted response',
        headers: {
          'X-Trace': {
            description: 'Trace id'
          }
        }
      });

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.strictEqual(updatedSpec.paths['/users'].get.responses['200'].description, 'Accepted response');
      assert.ok(updatedSpec.paths['/users'].get.responses['200'].headers['X-Trace']);
      assert.strictEqual(updatedSpec.paths['/users'].get.responses['200'].content, undefined);
      assert.strictEqual(updatedSpec.paths['/users'].get.responses['200']['x-old-field'], undefined);
    });

    test('should initialize responses when operation has no responses object', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            post: {}
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updateResponseSource(testFilePath, '/users', 'post', '202', {
        description: 'Accepted'
      });

      assert.strictEqual(result.success, true);

      const updatedSpec = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      assert.strictEqual(updatedSpec.paths['/users'].post.responses['202'].description, 'Accepted');
    });

    test('should fail when path does not exist', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': { description: 'OK' }
              }
            }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updateResponseSource(testFilePath, '/missing', 'get', '200', {
        description: 'Should not write'
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes('Path /missing not found in spec'));
    });

    test('should fail when method does not exist on a valid path', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': { description: 'OK' }
              }
            }
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(spec, null, 2));

      const result = await service.updateResponseSource(testFilePath, '/users', 'post', '200', {
        description: 'Should not write'
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes('Method post not found for path /users'));
    });
  });
});
