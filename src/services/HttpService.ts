import axios, { AxiosInstance, AxiosRequestConfig, CancelTokenSource } from 'axios';
import { RequestConfig, HttpResponse, QueryParam, HeaderParam } from '../models/types';

export class HttpService {
  private axiosInstance: AxiosInstance;
  private cancelTokenSource: CancelTokenSource | null = null;
  private defaultTimeout = 30000;

  constructor() {
    this.axiosInstance = axios.create({
      timeout: this.defaultTimeout,
      validateStatus: () => true // Accept all status codes
    });
  }

  async sendRequest(
    config: RequestConfig,
    environmentVariables: Record<string, string> = {}
  ): Promise<HttpResponse> {
    const startTime = Date.now();

    // Create cancel token
    this.cancelTokenSource = axios.CancelToken.source();

    try {
      // Build URL with path parameters
      let url = this.substituteVariables(config.baseUrl, environmentVariables);
      let path = this.substituteVariables(config.path, environmentVariables);

      // Replace path parameters
      for (const [key, value] of Object.entries(config.pathParams)) {
        const substitutedValue = this.substituteVariables(value, environmentVariables);
        path = path.replace(`{${key}}`, encodeURIComponent(substitutedValue));
      }

      url = url.replace(/\/$/, '') + path;

      // Build query string
      const enabledQueryParams = config.queryParams.filter(p => p.enabled);
      if (enabledQueryParams.length > 0) {
        const queryString = enabledQueryParams
          .map(p => {
            const key = this.substituteVariables(p.key, environmentVariables);
            const value = this.substituteVariables(p.value, environmentVariables);
            return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
          })
          .join('&');
        url += (url.includes('?') ? '&' : '?') + queryString;
      }

      // Build headers
      const headers: Record<string, string> = {};
      const enabledHeaders = config.headers.filter(h => h.enabled);
      for (const header of enabledHeaders) {
        const key = this.substituteVariables(header.key, environmentVariables);
        const value = this.substituteVariables(header.value, environmentVariables);
        headers[key] = value;
      }

      // Add content-type for body requests
      if (config.body && config.contentType) {
        headers['Content-Type'] = config.contentType;
      }

      // Prepare request body
      let data: unknown = undefined;
      if (config.body) {
        const substitutedBody = this.substituteVariables(config.body, environmentVariables);
        if (config.contentType === 'application/json') {
          try {
            data = JSON.parse(substitutedBody);
          } catch {
            data = substitutedBody;
          }
        } else {
          data = substitutedBody;
        }
      }

      // Build axios config
      const axiosConfig: AxiosRequestConfig = {
        method: config.method,
        url,
        headers,
        data,
        cancelToken: this.cancelTokenSource.token,
        timeout: this.defaultTimeout
      };

      // Send request
      const response = await this.axiosInstance.request(axiosConfig);

      const endTime = Date.now();

      // Build response
      const responseBody = typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data, null, 2);

      const responseHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(response.headers)) {
        if (typeof value === 'string') {
          responseHeaders[key] = value;
        } else if (Array.isArray(value)) {
          responseHeaders[key] = value.join(', ');
        }
      }

      return {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody,
        contentType: response.headers['content-type'] as string | undefined,
        size: Buffer.byteLength(responseBody, 'utf8'),
        time: endTime - startTime
      };
    } catch (error) {
      if (axios.isCancel(error)) {
        throw new Error('Request cancelled');
      }

      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          throw new Error('Request timed out');
        }
        if (error.code === 'ENOTFOUND') {
          throw new Error(`DNS lookup failed: ${error.message}`);
        }
        if (error.code === 'ECONNREFUSED') {
          throw new Error(`Connection refused: ${error.message}`);
        }
        throw new Error(`Network error: ${error.message}`);
      }

      throw error;
    } finally {
      this.cancelTokenSource = null;
    }
  }

  cancelRequest(): void {
    if (this.cancelTokenSource) {
      this.cancelTokenSource.cancel('Request cancelled by user');
      this.cancelTokenSource = null;
    }
  }

  setTimeout(timeout: number): void {
    this.defaultTimeout = timeout;
  }

  private substituteVariables(text: string, variables: Record<string, string>): string {
    if (!text) return text;

    return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      if (varName in variables) {
        return variables[varName];
      }
      // Return original if variable not found
      return match;
    });
  }

  buildCurlCommand(
    config: RequestConfig,
    environmentVariables: Record<string, string> = {}
  ): string {
    // Build URL with path parameters
    let url = this.substituteVariables(config.baseUrl, environmentVariables);
    let path = this.substituteVariables(config.path, environmentVariables);

    for (const [key, value] of Object.entries(config.pathParams)) {
      const substitutedValue = this.substituteVariables(value, environmentVariables);
      path = path.replace(`{${key}}`, encodeURIComponent(substitutedValue));
    }

    url = url.replace(/\/$/, '') + path;

    // Build query string
    const enabledQueryParams = config.queryParams.filter(p => p.enabled);
    if (enabledQueryParams.length > 0) {
      const queryString = enabledQueryParams
        .map(p => {
          const key = this.substituteVariables(p.key, environmentVariables);
          const value = this.substituteVariables(p.value, environmentVariables);
          return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
        })
        .join('&');
      url += (url.includes('?') ? '&' : '?') + queryString;
    }

    let curl = `curl -X ${config.method.toUpperCase()} '${url}'`;

    // Add headers
    const enabledHeaders = config.headers.filter(h => h.enabled);
    for (const header of enabledHeaders) {
      const key = this.substituteVariables(header.key, environmentVariables);
      const value = this.substituteVariables(header.value, environmentVariables);
      curl += ` \\\n  -H '${key}: ${value}'`;
    }

    // Add body
    if (config.body && config.contentType) {
      curl += ` \\\n  -H 'Content-Type: ${config.contentType}'`;
      const body = this.substituteVariables(config.body, environmentVariables);
      curl += ` \\\n  -d '${body.replace(/'/g, "\\'")}'`;
    }

    return curl;
  }
}
