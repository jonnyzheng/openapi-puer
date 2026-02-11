import { OpenAPI } from 'openapi-types';

export interface ApiFile {
  filePath: string;
  fileName: string;
  spec: OpenAPI.Document;
  endpoints: ApiEndpoint[];
  version: '2.0' | '3.0' | '3.1';
  title?: string;
  description?: string;
  servers?: ServerInfo[];
  components?: Record<string, Record<string, SchemaObject>>;
}

export interface ServerInfo {
  url: string;
  description?: string;
}

export interface ApiEndpoint {
  id: string;
  filePath: string;
  path: string;
  method: HttpMethod;
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters: ApiParameter[];
  requestBody?: ApiRequestBody;
  responses: ApiResponse[];
  deprecated?: boolean;
}

export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options' | 'trace';

export type ParameterLocation = 'path' | 'query' | 'header' | 'cookie';

export interface ApiParameter {
  name: string;
  in: ParameterLocation;
  description?: string;
  required: boolean;
  deprecated?: boolean;
  schema?: SchemaObject;
  example?: unknown;
}

export interface ApiRequestBody {
  description?: string;
  required: boolean;
  content: Record<string, MediaTypeObject>;
}

export interface MediaTypeObject {
  schema?: SchemaObject;
  example?: unknown;
  examples?: Record<string, ExampleObject>;
}

export interface ExampleObject {
  summary?: string;
  description?: string;
  value?: unknown;
}

export interface SchemaObject {
  type?: string;
  format?: string;
  properties?: Record<string, SchemaObject>;
  items?: SchemaObject;
  required?: string[];
  enum?: unknown[];
  description?: string;
  example?: unknown;
  default?: unknown;
  nullable?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
  deprecated?: boolean;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: boolean | number;
  exclusiveMaximum?: boolean | number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  $ref?: string;
}

export interface ApiResponse {
  statusCode: string;
  description?: string;
  content?: Record<string, MediaTypeObject>;
  headers?: Record<string, ApiParameter>;
}

export interface Environment {
  id: string;
  name: string;
  variables: EnvironmentVariable[];
  createdAt: string;
  updatedAt: string;
}

export interface EnvironmentVariable {
  key: string;
  value: string;
  description?: string;
  isSecret?: boolean;
}

export interface RequestConfig {
  baseUrl: string;
  path: string;
  method: HttpMethod;
  pathParams: Record<string, string>;
  queryParams: QueryParam[];
  headers: HeaderParam[];
  body?: string;
  contentType?: string;
}

export interface QueryParam {
  key: string;
  value: string;
  enabled: boolean;
}

export interface HeaderParam {
  key: string;
  value: string;
  enabled: boolean;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  contentType?: string;
  size: number;
  time: number;
}

export interface WebviewMessage {
  type: string;
  payload?: unknown;
}

export interface EndpointSelectedMessage extends WebviewMessage {
  type: 'endpointSelected';
  payload: {
    filePath: string;
    endpointId: string;
  };
}

export interface SendRequestMessage extends WebviewMessage {
  type: 'sendRequest';
  payload: RequestConfig;
}

export interface ResponseReceivedMessage extends WebviewMessage {
  type: 'responseReceived';
  payload: HttpResponse;
}

export interface ErrorMessage extends WebviewMessage {
  type: 'error';
  payload: {
    message: string;
    details?: string;
  };
}
