import axios, { AxiosInstance, AxiosRequestConfig, CancelTokenSource } from 'axios';
import { RequestConfig, HttpResponse, RequestAuthConfig } from '../models/types';

export class HttpService {
  private axiosInstance: AxiosInstance;
  private cancelTokenSource: CancelTokenSource | null = null;
  private defaultTimeout = 30000;

  constructor() {
    this.axiosInstance = axios.create({
      timeout: this.defaultTimeout,
      validateStatus: () => true
    });
  }

  async sendRequest(
    config: RequestConfig,
    environmentVariables: Record<string, string> = {}
  ): Promise<HttpResponse> {
    const startTime = Date.now();
    const requestTimeout = typeof config.timeoutMs === 'number' && Number.isFinite(config.timeoutMs) && config.timeoutMs > 0
      ? config.timeoutMs
      : this.defaultTimeout;

    this.cancelTokenSource = axios.CancelToken.source();

    try {
      const rawRequestUrl = typeof config.requestUrl === 'string' ? config.requestUrl.trim() : '';
      const hasRequestUrl = rawRequestUrl.length > 0;

      let url = hasRequestUrl
        ? this.substituteVariables(rawRequestUrl, environmentVariables)
        : this.substituteVariables(config.baseUrl, environmentVariables);
      let path = hasRequestUrl ? '' : this.substituteVariables(config.path, environmentVariables);

      for (const [key, value] of Object.entries(config.pathParams)) {
        const substitutedValue = this.substituteVariables(value, environmentVariables);
        if (hasRequestUrl) {
          url = url.split(`{${key}}`).join(encodeURIComponent(substitutedValue));
        } else {
          path = path.replace(`{${key}}`, encodeURIComponent(substitutedValue));
        }
      }

      if (!hasRequestUrl) {
        url = url.replace(/\/$/, '') + path;
      }

      const headers: Record<string, string> = {};
      const queryParams = config.queryParams.map(param => ({
        key: param.key,
        value: param.value,
        enabled: param.enabled
      }));

      const enabledHeaders = config.headers.filter(h => h.enabled);
      for (const header of enabledHeaders) {
        const key = this.substituteVariables(header.key, environmentVariables);
        const value = this.substituteVariables(header.value, environmentVariables);
        this.upsertHeader(headers, key, value);
      }

      this.applyAuthConfig(config.auth, queryParams, headers, environmentVariables);

      const enabledQueryParams = queryParams.filter(p => p.enabled);
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

      if (config.body && config.contentType) {
        this.upsertHeader(headers, 'Content-Type', config.contentType);
      }

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

      const axiosConfig: AxiosRequestConfig = {
        method: config.method,
        url,
        headers,
        data,
        cancelToken: this.cancelTokenSource.token,
        timeout: requestTimeout
      };

      const response = await this.axiosInstance.request(axiosConfig);
      const endTime = Date.now();

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

    const hasVariable = (variableName: string): boolean => Object.prototype.hasOwnProperty.call(variables, variableName);

    const substitutedText = text.replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, (match, varName) => {
      if (hasVariable(varName)) {
        return variables[varName];
      }
      return match;
    });

    return substitutedText.replace(/%7B%7B([a-zA-Z0-9_.-]+)%7D%7D/gi, (match, varName) => {
      if (hasVariable(varName)) {
        return encodeURIComponent(variables[varName]);
      }
      return match;
    });
  }

  private upsertHeader(headers: Record<string, string>, key: string, value: string): void {
    const normalizedKey = key.toLowerCase();
    const existingKey = Object.keys(headers).find(existing => existing.toLowerCase() === normalizedKey);
    if (existingKey) {
      headers[existingKey] = value;
      return;
    }
    headers[key] = value;
  }

  private upsertQueryParam(
    queryParams: Array<{ key: string; value: string; enabled: boolean }>,
    key: string,
    value: string
  ): void {
    const normalizedKey = key.toLowerCase();
    const existing = queryParams.find(param => param.key.toLowerCase() === normalizedKey);
    if (existing) {
      existing.value = value;
      existing.enabled = true;
      return;
    }
    queryParams.push({ key, value, enabled: true });
  }

  private applyAuthConfig(
    auth: RequestAuthConfig | undefined,
    queryParams: Array<{ key: string; value: string; enabled: boolean }>,
    headers: Record<string, string>,
    variables: Record<string, string>
  ): void {
    if (!auth || auth.type === 'none') {
      return;
    }

    if (auth.type === 'bearer') {
      const token = this.substituteVariables(auth.bearerToken || '', variables).trim();
      if (token) {
        this.upsertHeader(headers, 'Authorization', `Bearer ${token}`);
      }
      return;
    }

    if (auth.type === 'basic') {
      const username = this.substituteVariables(auth.basicUsername || '', variables);
      const password = this.substituteVariables(auth.basicPassword || '', variables);
      if (username || password) {
        const encoded = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
        this.upsertHeader(headers, 'Authorization', `Basic ${encoded}`);
      }
      return;
    }

    if (auth.type === 'api-key') {
      const keyName = this.substituteVariables(auth.apiKeyName || '', variables).trim();
      if (!keyName) {
        return;
      }

      const keyValue = this.substituteVariables(auth.apiKeyValue || '', variables);
      if (auth.apiKeyIn === 'query') {
        this.upsertQueryParam(queryParams, keyName, keyValue);
      } else {
        this.upsertHeader(headers, keyName, keyValue);
      }
    }
  }

  private formatCurlTimeoutSeconds(timeoutMs: number): string {
    return (timeoutMs / 1000).toFixed(3).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  }

  buildCurlCommand(
    config: RequestConfig,
    environmentVariables: Record<string, string> = {}
  ): string {
    const requestTimeout = typeof config.timeoutMs === 'number' && Number.isFinite(config.timeoutMs) && config.timeoutMs > 0
      ? config.timeoutMs
      : undefined;

    const headers: Record<string, string> = {};
    const queryParams = config.queryParams.map(param => ({
      key: param.key,
      value: param.value,
      enabled: param.enabled
    }));

    const rawRequestUrl = typeof config.requestUrl === 'string' ? config.requestUrl.trim() : '';
    const hasRequestUrl = rawRequestUrl.length > 0;

    let url = hasRequestUrl
      ? this.substituteVariables(rawRequestUrl, environmentVariables)
      : this.substituteVariables(config.baseUrl, environmentVariables);
    let path = hasRequestUrl ? '' : this.substituteVariables(config.path, environmentVariables);

    for (const [key, value] of Object.entries(config.pathParams)) {
      const substitutedValue = this.substituteVariables(value, environmentVariables);
      if (hasRequestUrl) {
        url = url.split(`{${key}}`).join(encodeURIComponent(substitutedValue));
      } else {
        path = path.replace(`{${key}}`, encodeURIComponent(substitutedValue));
      }
    }

    if (!hasRequestUrl) {
      url = url.replace(/\/$/, '') + path;
    }

    const enabledHeaders = config.headers.filter(h => h.enabled);
    for (const header of enabledHeaders) {
      const key = this.substituteVariables(header.key, environmentVariables);
      const value = this.substituteVariables(header.value, environmentVariables);
      this.upsertHeader(headers, key, value);
    }

    this.applyAuthConfig(config.auth, queryParams, headers, environmentVariables);

    if (config.body && config.contentType) {
      this.upsertHeader(headers, 'Content-Type', config.contentType);
    }

    const enabledQueryParams = queryParams.filter(p => p.enabled);
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

    for (const [key, value] of Object.entries(headers)) {
      curl += ` \\\n  -H '${key}: ${value}'`;
    }

    if (config.body) {
      const body = this.substituteVariables(config.body, environmentVariables);
      curl += ` \\\n  -d '${body.replace(/'/g, "\\'")}'`;
    }

    if (requestTimeout) {
      curl += ` \\\n  --max-time ${this.formatCurlTimeoutSeconds(requestTimeout)}`;
    }

    return curl;
  }
}
