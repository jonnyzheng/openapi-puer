import * as assert from 'assert';
import { HttpService } from '../services/HttpService';
import { RequestConfig } from '../models/types';

suite('HttpService Test Suite', () => {
  function createRequestConfig(overrides?: Partial<RequestConfig>): RequestConfig {
    return {
      requestUrl: '',
      baseUrl: '',
      path: '',
      method: 'get',
      pathParams: {},
      queryParams: [],
      headers: [],
      timeoutMs: 1000,
      ...overrides
    };
  }

  test('buildCurlCommand should replace {param} and resolve {{variable}} from environment', () => {
    const service = new HttpService();
    const config = createRequestConfig({
      requestUrl: 'https://api.example.com/tasks/{id}/view/{{envId}}',
      pathParams: { id: '123' }
    });

    const curl = service.buildCurlCommand(config, { envId: 'env-456' });

    assert.ok(curl.includes('https://api.example.com/tasks/123/view/env-456'));
  });

  test('sendRequest should replace {param} and resolve {{variable}} from environment', async () => {
    const service = new HttpService();
    let capturedUrl = '';
    (service as unknown as { axiosInstance: { request: (config: { url?: string }) => Promise<unknown> } }).axiosInstance = {
      request: async (axiosConfig: { url?: string }) => {
        capturedUrl = axiosConfig.url || '';
        return {
          status: 200,
          statusText: 'OK',
          data: '{}',
          headers: { 'content-type': 'application/json' }
        };
      }
    };

    const config = createRequestConfig({
      requestUrl: 'https://api.example.com/tasks/{id}/view/{{envId}}',
      pathParams: { id: 'abc 123' }
    });

    const response = await service.sendRequest(config, { envId: 'env value' });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(capturedUrl, 'https://api.example.com/tasks/abc%20123/view/env value');
  });

  test('sendRequest should keep unresolved {{variable}} untouched', async () => {
    const service = new HttpService();
    let capturedUrl = '';
    (service as unknown as { axiosInstance: { request: (config: { url?: string }) => Promise<unknown> } }).axiosInstance = {
      request: async (axiosConfig: { url?: string }) => {
        capturedUrl = axiosConfig.url || '';
        return {
          status: 200,
          statusText: 'OK',
          data: '{}',
          headers: { 'content-type': 'application/json' }
        };
      }
    };

    const config = createRequestConfig({
      requestUrl: 'https://api.example.com/tasks/{id}/view/{{missingVar}}',
      pathParams: { id: '321' }
    });

    await service.sendRequest(config, {});
    assert.strictEqual(capturedUrl, 'https://api.example.com/tasks/321/view/{{missingVar}}');
  });
});
