import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import SwaggerParser from '@apidevtools/swagger-parser';
import { OpenAPI, OpenAPIV2, OpenAPIV3, OpenAPIV3_1 } from 'openapi-types';
import {
  ApiFile,
  ApiEndpoint,
  ApiParameter,
  ApiRequestBody,
  ApiResponse,
  HttpMethod,
  ParameterLocation,
  SchemaObject,
  ServerInfo,
  MediaTypeObject
} from '../models/types';

interface CacheEntry {
  mtime: number;
  apiFile: ApiFile;
}

export class OpenApiService {
  private cache: Map<string, CacheEntry> = new Map();
  private outputChannel: vscode.OutputChannel;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('SuperAPI');
  }

  async parseFile(filePath: string): Promise<ApiFile | null> {
    try {
      const stat = fs.statSync(filePath);
      const cached = this.cache.get(filePath);

      if (cached && cached.mtime === stat.mtimeMs) {
        return cached.apiFile;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      let parsed: unknown;

      try {
        parsed = JSON.parse(content);
      } catch {
        this.outputChannel.appendLine(`Failed to parse ${filePath}: Invalid JSON`);
        return null;
      }

      if (!this.isOpenApiSpec(parsed)) {
        return null;
      }

      // Use bundle() instead of validate() to keep $ref references intact
      // This allows us to show component names in the UI
      const spec = await SwaggerParser.bundle(filePath) as OpenAPI.Document;
      const version = this.getSpecVersion(spec);
      const apiFile: ApiFile = {
        filePath,
        fileName: path.basename(filePath),
        spec,
        version,
        title: this.getTitle(spec),
        description: this.getDescription(spec),
        servers: this.getServers(spec),
        endpoints: this.extractEndpoints(filePath, spec),
        components: this.extractComponents(spec)
      };

      this.cache.set(filePath, { mtime: stat.mtimeMs, apiFile });
      return apiFile;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error parsing ${filePath}: ${message}`);
      return null;
    }
  }

  async scanDirectory(dirPath: string): Promise<ApiFile[]> {
    const apiFiles: ApiFile[] = [];

    if (!fs.existsSync(dirPath)) {
      vscode.window.showErrorMessage(`API directory not found: ${dirPath}`);
      return apiFiles;
    }

    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      vscode.window.showErrorMessage(`API directory not found: ${dirPath}`);
      return apiFiles;
    }

    const files = this.findJsonFiles(dirPath);

    for (const file of files) {
      const apiFile = await this.parseFile(file);
      if (apiFile) {
        apiFiles.push(apiFile);
      }
    }

    return apiFiles;
  }

  private findJsonFiles(dirPath: string): string[] {
    const jsonFiles: string[] = [];

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        jsonFiles.push(...this.findJsonFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        jsonFiles.push(fullPath);
      }
    }

    return jsonFiles;
  }

  extractEndpoints(filePath: string, spec: OpenAPI.Document): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    const paths = (spec as OpenAPIV3.Document).paths || (spec as OpenAPIV2.Document).paths;

    if (!paths) {
      return endpoints;
    }

    for (const [pathStr, pathItem] of Object.entries(paths)) {
      if (!pathItem) continue;

      const methods: HttpMethod[] = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace'];

      for (const method of methods) {
        const operation = (pathItem as Record<string, unknown>)[method] as OpenAPIV3.OperationObject | OpenAPIV2.OperationObject | undefined;
        if (!operation) continue;

        const endpoint: ApiEndpoint = {
          id: `${method.toUpperCase()}-${pathStr}`,
          filePath,
          path: pathStr,
          method,
          operationId: operation.operationId,
          summary: operation.summary,
          description: operation.description,
          tags: operation.tags,
          deprecated: operation.deprecated,
          parameters: this.extractParameters(operation, pathItem, spec),
          requestBody: this.extractRequestBody(operation, spec),
          responses: this.extractResponses(operation, spec)
        };

        endpoints.push(endpoint);
      }
    }

    return endpoints;
  }

  private extractParameters(
    operation: OpenAPIV3.OperationObject | OpenAPIV2.OperationObject,
    pathItem: OpenAPIV3.PathItemObject | OpenAPIV2.PathItemObject,
    spec: OpenAPI.Document
  ): ApiParameter[] {
    const params: ApiParameter[] = [];
    const allParams = [
      ...(pathItem.parameters || []),
      ...(operation.parameters || [])
    ];

    for (const param of allParams) {
      const resolved = this.resolveRef(param, spec) as OpenAPIV3.ParameterObject | OpenAPIV2.ParameterObject;
      if (!resolved) continue;

      params.push({
        name: resolved.name,
        in: resolved.in as ParameterLocation,
        description: resolved.description,
        required: resolved.required || resolved.in === 'path',
        deprecated: (resolved as OpenAPIV3.ParameterObject).deprecated,
        schema: this.extractSchema((resolved as OpenAPIV3.ParameterObject).schema, spec),
        example: (resolved as OpenAPIV3.ParameterObject).example
      });
    }

    return params;
  }

  private extractRequestBody(
    operation: OpenAPIV3.OperationObject | OpenAPIV2.OperationObject,
    spec: OpenAPI.Document
  ): ApiRequestBody | undefined {
    const v3Operation = operation as OpenAPIV3.OperationObject;

    if (v3Operation.requestBody) {
      const resolved = this.resolveRef(v3Operation.requestBody, spec) as OpenAPIV3.RequestBodyObject;
      if (!resolved) return undefined;

      const content: Record<string, MediaTypeObject> = {};
      for (const [mediaType, mediaTypeObj] of Object.entries(resolved.content || {})) {
        content[mediaType] = {
          schema: this.extractSchema(mediaTypeObj.schema, spec),
          example: mediaTypeObj.example,
          examples: mediaTypeObj.examples as Record<string, { summary?: string; description?: string; value?: unknown }>
        };
      }

      return {
        description: resolved.description,
        required: resolved.required || false,
        content
      };
    }

    // Handle OpenAPI 2.0 body parameter
    const v2Operation = operation as OpenAPIV2.OperationObject;
    const bodyParam = v2Operation.parameters?.find(
      (p) => (p as OpenAPIV2.InBodyParameterObject).in === 'body'
    ) as OpenAPIV2.InBodyParameterObject | undefined;

    if (bodyParam) {
      return {
        description: bodyParam.description,
        required: bodyParam.required || false,
        content: {
          'application/json': {
            schema: this.extractSchema(bodyParam.schema, spec)
          }
        }
      };
    }

    return undefined;
  }

  private extractResponses(
    operation: OpenAPIV3.OperationObject | OpenAPIV2.OperationObject,
    spec: OpenAPI.Document
  ): ApiResponse[] {
    const responses: ApiResponse[] = [];

    if (!operation.responses) return responses;

    for (const [statusCode, response] of Object.entries(operation.responses)) {
      const resolved = this.resolveRef(response, spec) as OpenAPIV3.ResponseObject | OpenAPIV2.ResponseObject;
      if (!resolved) continue;

      const apiResponse: ApiResponse = {
        statusCode,
        description: resolved.description
      };

      // OpenAPI 3.x
      const v3Response = resolved as OpenAPIV3.ResponseObject;
      if (v3Response.content) {
        apiResponse.content = {};
        for (const [mediaType, mediaTypeObj] of Object.entries(v3Response.content)) {
          apiResponse.content[mediaType] = {
            schema: this.extractSchema(mediaTypeObj.schema, spec),
            example: mediaTypeObj.example
          };
        }
      }

      // OpenAPI 2.x
      const v2Response = resolved as OpenAPIV2.ResponseObject;
      if (v2Response.schema) {
        apiResponse.content = {
          'application/json': {
            schema: this.extractSchema(v2Response.schema, spec)
          }
        };
      }

      responses.push(apiResponse);
    }

    return responses;
  }

  private extractSchema(
    schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | OpenAPIV2.SchemaObject | undefined,
    spec: OpenAPI.Document
  ): SchemaObject | undefined {
    if (!schema) return undefined;

    // Capture the $ref name before resolving
    const refObj = schema as { $ref?: string };
    let refName: string | undefined;
    if (refObj.$ref) {
      // Extract component name from $ref like "#/components/schemas/User" or "#/definitions/User"
      const refParts = refObj.$ref.split('/');
      refName = refParts[refParts.length - 1];
    }

    const resolved = this.resolveRef(schema, spec) as OpenAPIV3.SchemaObject | OpenAPIV2.SchemaObject;
    if (!resolved) return undefined;

    const result: SchemaObject = {
      type: resolved.type as string,
      format: resolved.format,
      description: resolved.description,
      enum: resolved.enum,
      default: resolved.default,
      example: resolved.example
    };

    // Preserve the component name if this was a $ref
    if (refName) {
      result.$ref = refName;
    }

    if (resolved.properties) {
      result.properties = {};
      for (const [key, value] of Object.entries(resolved.properties)) {
        result.properties[key] = this.extractSchema(value, spec) || {};
      }
    }

    if ('items' in resolved && resolved.items) {
      result.items = this.extractSchema(resolved.items as OpenAPIV3.SchemaObject, spec);
    }

    if (resolved.required) {
      result.required = resolved.required;
    }

    const v3Schema = resolved as OpenAPIV3.SchemaObject;
    if (v3Schema.nullable !== undefined) {
      result.nullable = v3Schema.nullable;
    }
    if (v3Schema.readOnly !== undefined) {
      result.readOnly = v3Schema.readOnly;
    }
    if (v3Schema.writeOnly !== undefined) {
      result.writeOnly = v3Schema.writeOnly;
    }

    return result;
  }

  private resolveRef(obj: unknown, spec: OpenAPI.Document): unknown {
    if (!obj || typeof obj !== 'object') return obj;

    const refObj = obj as { $ref?: string };
    if (!refObj.$ref) return obj;

    const refPath = refObj.$ref.replace('#/', '').split('/');
    let resolved: unknown = spec;

    for (const part of refPath) {
      if (resolved && typeof resolved === 'object') {
        resolved = (resolved as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return resolved;
  }

  private isOpenApiSpec(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object') return false;
    const spec = obj as Record<string, unknown>;
    return 'swagger' in spec || 'openapi' in spec;
  }

  private getSpecVersion(spec: OpenAPI.Document): '2.0' | '3.0' | '3.1' {
    if ('swagger' in spec) return '2.0';
    const openapi = (spec as OpenAPIV3.Document).openapi;
    if (openapi?.startsWith('3.1')) return '3.1';
    return '3.0';
  }

  private getTitle(spec: OpenAPI.Document): string | undefined {
    return spec.info?.title;
  }

  private getDescription(spec: OpenAPI.Document): string | undefined {
    return spec.info?.description;
  }

  private getServers(spec: OpenAPI.Document): ServerInfo[] {
    const v3Spec = spec as OpenAPIV3.Document;
    if (v3Spec.servers) {
      return v3Spec.servers.map(s => ({
        url: s.url,
        description: s.description
      }));
    }

    const v2Spec = spec as OpenAPIV2.Document;
    if (v2Spec.host) {
      const scheme = v2Spec.schemes?.[0] || 'https';
      const basePath = v2Spec.basePath || '';
      return [{
        url: `${scheme}://${v2Spec.host}${basePath}`
      }];
    }

    return [];
  }

  private extractComponents(spec: OpenAPI.Document): Record<string, Record<string, SchemaObject>> | undefined {
    const result: Record<string, Record<string, SchemaObject>> = {};

    // OpenAPI 3.x components
    const v3Spec = spec as OpenAPIV3.Document;
    if (v3Spec.components) {
      if (v3Spec.components.schemas) {
        result.schemas = {};
        for (const [name, schema] of Object.entries(v3Spec.components.schemas)) {
          result.schemas[name] = this.extractSchema(schema, spec) || {};
        }
      }
      if (v3Spec.components.responses) {
        result.responses = {};
        for (const [name, response] of Object.entries(v3Spec.components.responses)) {
          const resolved = this.resolveRef(response, spec) as OpenAPIV3.ResponseObject;
          if (resolved) {
            result.responses[name] = {
              description: resolved.description,
              type: 'response'
            } as SchemaObject;
          }
        }
      }
      if (v3Spec.components.parameters) {
        result.parameters = {};
        for (const [name, param] of Object.entries(v3Spec.components.parameters)) {
          const resolved = this.resolveRef(param, spec) as OpenAPIV3.ParameterObject;
          if (resolved) {
            result.parameters[name] = {
              type: resolved.schema ? (resolved.schema as OpenAPIV3.SchemaObject).type : 'string',
              description: resolved.description
            } as SchemaObject;
          }
        }
      }
    }

    // OpenAPI 2.x definitions
    const v2Spec = spec as OpenAPIV2.Document;
    if (v2Spec.definitions) {
      result.schemas = {};
      for (const [name, schema] of Object.entries(v2Spec.definitions)) {
        result.schemas[name] = this.extractSchema(schema, spec) || {};
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  async updateEndpointOverview(
    filePath: string,
    endpointPath: string,
    method: string,
    updates: {
      summary?: string;
      description?: string;
      operationId?: string;
      tags?: string[];
      deprecated?: boolean;
    }
  ): Promise<{ success: boolean; message?: string }> {
    try {
      // Read the raw file content
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const spec = JSON.parse(content);

      // Find the path and method in the spec
      const pathObj = spec.paths?.[endpointPath];
      if (!pathObj) {
        return { success: false, message: `Path ${endpointPath} not found in spec` };
      }

      const operation = pathObj[method.toLowerCase()];
      if (!operation) {
        return { success: false, message: `Method ${method} not found for path ${endpointPath}` };
      }

      // Update the operation fields
      if (updates.summary !== undefined) {
        if (updates.summary) {
          operation.summary = updates.summary;
        } else {
          delete operation.summary;
        }
      }

      if (updates.description !== undefined) {
        if (updates.description) {
          operation.description = updates.description;
        } else {
          delete operation.description;
        }
      }

      if (updates.operationId !== undefined) {
        if (updates.operationId) {
          operation.operationId = updates.operationId;
        } else {
          delete operation.operationId;
        }
      }

      if (updates.tags !== undefined) {
        if (updates.tags && updates.tags.length > 0) {
          operation.tags = updates.tags;
        } else {
          delete operation.tags;
        }
      }

      if (updates.deprecated !== undefined) {
        if (updates.deprecated) {
          operation.deprecated = true;
        } else {
          delete operation.deprecated;
        }
      }

      // Write the updated spec back to file
      const updatedContent = JSON.stringify(spec, null, 2);
      await fs.promises.writeFile(filePath, updatedContent, 'utf-8');

      // Clear cache for this file so it gets re-parsed
      this.removeFromCache(filePath);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error updating endpoint: ${message}`);
      return { success: false, message };
    }
  }

  async updateParameter(
    filePath: string,
    endpointPath: string,
    method: string,
    paramName: string,
    paramIn: string,
    field: string,
    value: unknown
  ): Promise<{ success: boolean; message?: string }> {
    try {
      // Read the raw file content
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const spec = JSON.parse(content);

      // Find the path and method in the spec
      const pathObj = spec.paths?.[endpointPath];
      if (!pathObj) {
        return { success: false, message: `Path ${endpointPath} not found in spec` };
      }

      const operation = pathObj[method.toLowerCase()];
      if (!operation) {
        return { success: false, message: `Method ${method} not found for path ${endpointPath}` };
      }

      // Find the parameter
      const parameters = operation.parameters || [];
      const paramIndex = parameters.findIndex(
        (p: { name: string; in: string; $ref?: string }) => {
          // Handle $ref parameters
          if (p.$ref) {
            const resolved = this.resolveRefPath(p.$ref, spec);
            return resolved?.name === paramName && resolved?.in === paramIn;
          }
          return p.name === paramName && p.in === paramIn;
        }
      );

      if (paramIndex === -1) {
        return { success: false, message: `Parameter ${paramName} (${paramIn}) not found` };
      }

      const param = parameters[paramIndex];

      // Handle $ref - we need to update the referenced parameter
      if (param.$ref) {
        const refPath = param.$ref.replace('#/', '').split('/');
        let target = spec;
        for (let i = 0; i < refPath.length - 1; i++) {
          target = target[refPath[i]];
        }
        const refParam = target[refPath[refPath.length - 1]];
        this.updateParameterField(refParam, field, value);
      } else {
        this.updateParameterField(param, field, value);
      }

      // Write the updated spec back to file
      const updatedContent = JSON.stringify(spec, null, 2);
      await fs.promises.writeFile(filePath, updatedContent, 'utf-8');

      // Clear cache for this file so it gets re-parsed
      this.removeFromCache(filePath);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error updating parameter: ${message}`);
      return { success: false, message };
    }
  }

  private updateParameterField(param: Record<string, unknown>, field: string, value: unknown): void {
    if (field === 'type') {
      if (!param.schema) {
        param.schema = {};
      }
      (param.schema as Record<string, unknown>).type = value;
    } else if (field === 'required') {
      if (value) {
        param.required = true;
      } else {
        delete param.required;
      }
    } else if (field === 'description') {
      if (value) {
        param.description = value;
      } else {
        delete param.description;
      }
    }
  }

  private resolveRefPath(ref: string, spec: Record<string, unknown>): Record<string, unknown> | null {
    const refPath = ref.replace('#/', '').split('/');
    let resolved: unknown = spec;
    for (const part of refPath) {
      if (resolved && typeof resolved === 'object') {
        resolved = (resolved as Record<string, unknown>)[part];
      } else {
        return null;
      }
    }
    return resolved as Record<string, unknown>;
  }

  async addParameter(
    filePath: string,
    endpointPath: string,
    method: string,
    parameter: {
      name: string;
      in: string;
      type: string;
      required: boolean;
      description?: string;
    }
  ): Promise<{ success: boolean; message?: string }> {
    try {
      // Read the raw file content
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const spec = JSON.parse(content);

      // Find the path and method in the spec
      const pathObj = spec.paths?.[endpointPath];
      if (!pathObj) {
        return { success: false, message: `Path ${endpointPath} not found in spec` };
      }

      const operation = pathObj[method.toLowerCase()];
      if (!operation) {
        return { success: false, message: `Method ${method} not found for path ${endpointPath}` };
      }

      // Initialize parameters array if it doesn't exist
      if (!operation.parameters) {
        operation.parameters = [];
      }

      // Check for duplicate
      const exists = operation.parameters.some(
        (p: { name: string; in: string }) => p.name === parameter.name && p.in === parameter.in
      );
      if (exists) {
        return { success: false, message: `Parameter ${parameter.name} (${parameter.in}) already exists` };
      }

      // Create the new parameter object
      const newParam: Record<string, unknown> = {
        name: parameter.name,
        in: parameter.in,
        schema: { type: parameter.type }
      };

      if (parameter.required) {
        newParam.required = true;
      }

      if (parameter.description) {
        newParam.description = parameter.description;
      }

      // Add the parameter
      operation.parameters.push(newParam);

      // Write the updated spec back to file
      const updatedContent = JSON.stringify(spec, null, 2);
      await fs.promises.writeFile(filePath, updatedContent, 'utf-8');

      // Clear cache for this file so it gets re-parsed
      this.removeFromCache(filePath);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error adding parameter: ${message}`);
      return { success: false, message };
    }
  }

  async deleteParameter(
    filePath: string,
    endpointPath: string,
    method: string,
    paramName: string,
    paramIn: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      // Read the raw file content
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const spec = JSON.parse(content);

      // Find the path and method in the spec
      const pathObj = spec.paths?.[endpointPath];
      if (!pathObj) {
        return { success: false, message: `Path ${endpointPath} not found in spec` };
      }

      const operation = pathObj[method.toLowerCase()];
      if (!operation) {
        return { success: false, message: `Method ${method} not found for path ${endpointPath}` };
      }

      if (!operation.parameters || operation.parameters.length === 0) {
        return { success: false, message: 'No parameters to delete' };
      }

      // Find the parameter index
      const paramIndex = operation.parameters.findIndex(
        (p: { name: string; in: string; $ref?: string }) => {
          // Handle $ref parameters
          if (p.$ref) {
            const resolved = this.resolveRefPath(p.$ref, spec);
            return resolved?.name === paramName && resolved?.in === paramIn;
          }
          return p.name === paramName && p.in === paramIn;
        }
      );

      if (paramIndex === -1) {
        return { success: false, message: `Parameter ${paramName} (${paramIn}) not found` };
      }

      // Remove the parameter
      operation.parameters.splice(paramIndex, 1);

      // If parameters array is empty, remove it
      if (operation.parameters.length === 0) {
        delete operation.parameters;
      }

      // Write the updated spec back to file
      const updatedContent = JSON.stringify(spec, null, 2);
      await fs.promises.writeFile(filePath, updatedContent, 'utf-8');

      // Clear cache for this file so it gets re-parsed
      this.removeFromCache(filePath);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error deleting parameter: ${message}`);
      return { success: false, message };
    }
  }

  async updatePath(
    filePath: string,
    oldPath: string,
    newPath: string,
    method: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      // Read the raw file content
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const spec = JSON.parse(content);

      // Check if old path exists
      if (!spec.paths?.[oldPath]) {
        return { success: false, message: `Path ${oldPath} not found in spec` };
      }

      // Get the path object
      const pathObj = spec.paths[oldPath];

      // Check if the method exists on old path
      if (!pathObj[method.toLowerCase()]) {
        return { success: false, message: `Method ${method} not found for path ${oldPath}` };
      }

      // If path is changing, validate Method+Path uniqueness
      if (oldPath !== newPath) {
        // Check if the new path already has this method (Method+Path must be unique)
        if (spec.paths[newPath] && spec.paths[newPath][method.toLowerCase()]) {
          return { success: false, message: `${method.toUpperCase()} ${newPath} already exists in spec` };
        }

        // Create new path if it doesn't exist
        if (!spec.paths[newPath]) {
          spec.paths[newPath] = {};
        }

        // Move the method to the new path
        spec.paths[newPath][method.toLowerCase()] = pathObj[method.toLowerCase()];

        // Remove the method from old path
        delete pathObj[method.toLowerCase()];

        // If old path has no more methods, remove it
        if (Object.keys(pathObj).length === 0) {
          delete spec.paths[oldPath];
        }
      }

      // Write the updated spec back to file
      const updatedContent = JSON.stringify(spec, null, 2);
      await fs.promises.writeFile(filePath, updatedContent, 'utf-8');

      // Clear cache for this file so it gets re-parsed
      this.removeFromCache(filePath);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error updating path: ${message}`);
      return { success: false, message };
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  removeFromCache(filePath: string): void {
    this.cache.delete(filePath);
  }

  dispose(): void {
    this.outputChannel.dispose();
  }
}
