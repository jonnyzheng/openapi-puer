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
  private writeLocks: Map<string, Promise<void>> = new Map();

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('OpenAPI Puer');
  }

  private async withWriteLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.writeLocks.get(filePath) || Promise.resolve();
    let resolve: () => void;
    const newLock = new Promise<void>(r => { resolve = r; });
    this.writeLocks.set(filePath, newLock);
    await existing;
    try {
      return await fn();
    } finally {
      resolve!();
      if (this.writeLocks.get(filePath) === newLock) {
        this.writeLocks.delete(filePath);
      }
    }
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
        if (this.isSchemaFile(parsed)) {
          return this.parseSchemaFile(filePath, parsed as Record<string, unknown>, stat.mtimeMs);
        }
        return null;
      }

      // Use bundle() instead of validate() to keep $ref references intact
      // This allows us to show component names in the UI
      // If bundle fails (e.g., due to unresolved external refs), fall back to using the parsed content directly
      let spec: OpenAPI.Document;
      try {
        spec = await SwaggerParser.bundle(filePath) as OpenAPI.Document;
      } catch (bundleError) {
        const bundleMessage = bundleError instanceof Error ? bundleError.message : String(bundleError);
        this.outputChannel.appendLine(`Warning: Failed to bundle ${filePath}: ${bundleMessage}. Using raw parsed content.`);
        spec = parsed as OpenAPI.Document;
      }
      const version = this.getSpecVersion(spec);
      const apiFile: ApiFile = {
        filePath,
        fileName: path.basename(filePath),
        spec,
        version,
        title: this.getTitle(spec),
        description: this.getDescription(spec),
        servers: this.getServers(spec),
        endpoints: this.extractEndpoints(filePath, spec, content),
        components: this.extractComponents(spec, filePath)
      };

      this.cache.set(filePath, { mtime: stat.mtimeMs, apiFile });
      return apiFile;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error parsing ${filePath}: ${message}`);
      return null;
    }
  }

  private parseSchemaFile(filePath: string, parsed: Record<string, unknown>, mtimeMs: number): ApiFile {
    const components = parsed.components as Record<string, Record<string, unknown>>;
    const result: Record<string, Record<string, SchemaObject>> = {};

    if (components.schemas) {
      result.schemas = {};
      for (const [name, schema] of Object.entries(components.schemas)) {
        result.schemas[name] = this.extractSchemaFromRaw(schema as Record<string, unknown>);
      }
    }

    if (components.parameters) {
      result.parameters = {};
      for (const [name, param] of Object.entries(components.parameters)) {
        const paramObj = param as Record<string, unknown>;
        const schemaObj = paramObj.schema as Record<string, unknown> | undefined;
        result.parameters[name] = {
          type: schemaObj?.type as string || 'string',
          format: schemaObj?.format as string | undefined,
          description: paramObj.description as string | undefined,
          example: paramObj.example,
          deprecated: paramObj.deprecated as boolean | undefined,
          enum: schemaObj?.enum as unknown[] | undefined,
          default: schemaObj?.default,
          pattern: schemaObj?.pattern as string | undefined,
          minimum: schemaObj?.minimum as number | undefined,
          maximum: schemaObj?.maximum as number | undefined,
          minLength: schemaObj?.minLength as number | undefined,
          maxLength: schemaObj?.maxLength as number | undefined,
          _paramIn: paramObj.in as 'path' | 'query' | 'header' | 'cookie',
          _paramRequired: paramObj.required as boolean | undefined,
          _paramName: paramObj.name as string | undefined,
        } as SchemaObject;
      }
    }

    const apiFile: ApiFile = {
      filePath,
      fileName: path.basename(filePath),
      spec: parsed as unknown as OpenAPI.Document,
      version: '3.0',
      title: path.basename(filePath, '.json'),
      description: undefined,
      servers: [],
      endpoints: [],
      components: result
    };

    this.cache.set(filePath, { mtime: mtimeMs, apiFile });
    return apiFile;
  }

  private extractSchemaFromRaw(schema: Record<string, unknown>): SchemaObject {
    // Handle allOf - merge all schemas into one
    if (schema.allOf && Array.isArray(schema.allOf)) {
      const extractedSchemas: SchemaObject[] = [];
      for (const subSchema of schema.allOf) {
        if (subSchema && typeof subSchema === 'object') {
          extractedSchemas.push(this.extractSchemaFromRaw(subSchema as Record<string, unknown>));
        }
      }
      const merged = this.mergeAllOfSchemas(extractedSchemas);
      // Preserve any top-level properties from the original schema
      if (schema.type) merged.type = schema.type as string;
      if (schema.description) merged.description = schema.description as string;
      return merged;
    }

    // Handle oneOf - preserve as array
    if (schema.oneOf && Array.isArray(schema.oneOf)) {
      const result: SchemaObject = {
        type: schema.type as string | undefined,
        description: schema.description as string | undefined,
        oneOf: []
      };
      for (const subSchema of schema.oneOf) {
        if (subSchema && typeof subSchema === 'object') {
          result.oneOf!.push(this.extractSchemaFromRaw(subSchema as Record<string, unknown>));
        }
      }
      if (schema.discriminator) {
        result.discriminator = schema.discriminator as SchemaObject['discriminator'];
      }
      return result;
    }

    // Handle anyOf - preserve as array
    if (schema.anyOf && Array.isArray(schema.anyOf)) {
      const result: SchemaObject = {
        type: schema.type as string | undefined,
        description: schema.description as string | undefined,
        anyOf: []
      };
      for (const subSchema of schema.anyOf) {
        if (subSchema && typeof subSchema === 'object') {
          result.anyOf!.push(this.extractSchemaFromRaw(subSchema as Record<string, unknown>));
        }
      }
      if (schema.discriminator) {
        result.discriminator = schema.discriminator as SchemaObject['discriminator'];
      }
      return result;
    }

    const result: SchemaObject = {
      type: schema.type as string | undefined,
      format: schema.format as string | undefined,
      description: schema.description as string | undefined,
      example: schema.example,
      default: schema.default,
      nullable: schema.nullable as boolean | undefined,
      enum: schema.enum as unknown[] | undefined,
      readOnly: schema.readOnly as boolean | undefined,
      writeOnly: schema.writeOnly as boolean | undefined,
      deprecated: schema.deprecated as boolean | undefined,
      pattern: schema.pattern as string | undefined,
      minLength: schema.minLength as number | undefined,
      maxLength: schema.maxLength as number | undefined,
      minimum: schema.minimum as number | undefined,
      maximum: schema.maximum as number | undefined,
      exclusiveMinimum: schema.exclusiveMinimum as boolean | number | undefined,
      exclusiveMaximum: schema.exclusiveMaximum as boolean | number | undefined,
      minItems: schema.minItems as number | undefined,
      maxItems: schema.maxItems as number | undefined,
      uniqueItems: schema.uniqueItems as boolean | undefined,
    };

    if (schema.required && Array.isArray(schema.required)) {
      result.required = schema.required as string[];
    }

    if (schema.properties && typeof schema.properties === 'object') {
      result.properties = {};
      for (const [key, value] of Object.entries(schema.properties as Record<string, unknown>)) {
        result.properties[key] = this.extractSchemaFromRaw(value as Record<string, unknown>);
      }
    }

    if (schema.items && typeof schema.items === 'object') {
      result.items = this.extractSchemaFromRaw(schema.items as Record<string, unknown>);
    }

    if (schema.$ref) {
      const refParts = (schema.$ref as string).split('/');
      result.$ref = refParts[refParts.length - 1];
    }

    return result;
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

  extractEndpoints(filePath: string, spec: OpenAPI.Document, rawContent?: string): ApiEndpoint[] {
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
          parameters: this.extractParameters(operation, pathItem, spec, filePath),
          requestBody: this.extractRequestBody(operation, spec, filePath),
          responses: this.extractResponses(operation, spec, filePath, rawContent, pathStr, method)
        };

        endpoints.push(endpoint);
      }
    }

    return endpoints;
  }

  private extractParameters(
    operation: OpenAPIV3.OperationObject | OpenAPIV2.OperationObject,
    pathItem: OpenAPIV3.PathItemObject | OpenAPIV2.PathItemObject,
    spec: OpenAPI.Document,
    filePath?: string
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
        schema: this.extractSchema((resolved as OpenAPIV3.ParameterObject).schema, spec, filePath),
        example: (resolved as OpenAPIV3.ParameterObject).example
      });
    }

    return params;
  }

  private extractRequestBody(
    operation: OpenAPIV3.OperationObject | OpenAPIV2.OperationObject,
    spec: OpenAPI.Document,
    filePath?: string
  ): ApiRequestBody | undefined {
    const v3Operation = operation as OpenAPIV3.OperationObject;

    if (v3Operation.requestBody) {
      const resolved = this.resolveRef(v3Operation.requestBody, spec) as OpenAPIV3.RequestBodyObject;
      if (!resolved) return undefined;

      const content: Record<string, MediaTypeObject> = {};
      for (const [mediaType, mediaTypeObj] of Object.entries(resolved.content || {})) {
        content[mediaType] = {
          schema: this.extractSchema(mediaTypeObj.schema, spec, filePath),
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
            schema: this.extractSchema(bodyParam.schema, spec, filePath)
          }
        }
      };
    }

    return undefined;
  }

  private extractResponses(
    operation: OpenAPIV3.OperationObject | OpenAPIV2.OperationObject,
    spec: OpenAPI.Document,
    filePath?: string,
    rawContent?: string,
    pathStr?: string,
    method?: string
  ): ApiResponse[] {
    const responses: ApiResponse[] = [];

    if (!operation.responses) return responses;

    // Get the key order from the raw JSON string to preserve file order,
    // since JSON.parse sorts integer-like keys (e.g. "200", "404").
    let keyOrder: string[] | null = null;
    if (rawContent && pathStr && method) {
      keyOrder = this.extractResponseKeyOrder(rawContent, pathStr, method);
    }

    for (const [statusCode, response] of Object.entries(operation.responses)) {
      const resolved = this.resolveRef(response, spec) as OpenAPIV3.ResponseObject | OpenAPIV2.ResponseObject;
      if (!resolved) continue;

      const apiResponse: ApiResponse = {
        statusCode,
        description: resolved.description,
        _source: JSON.parse(JSON.stringify(resolved)) // Store original source
      };

      // OpenAPI 3.x
      const v3Response = resolved as OpenAPIV3.ResponseObject;
      if (v3Response.content) {
        apiResponse.content = {};
        for (const [mediaType, mediaTypeObj] of Object.entries(v3Response.content)) {
          apiResponse.content[mediaType] = {
            schema: this.extractSchema(mediaTypeObj.schema, spec, filePath),
            example: mediaTypeObj.example
          };
        }
      }

      // OpenAPI 2.x
      const v2Response = resolved as OpenAPIV2.ResponseObject;
      if (v2Response.schema) {
        apiResponse.content = {
          'application/json': {
            schema: this.extractSchema(v2Response.schema, spec, filePath)
          }
        };
      }

      responses.push(apiResponse);
    }

    // Sort responses to match the key order from the raw JSON file
    if (keyOrder && keyOrder.length > 0) {
      responses.sort((a, b) => {
        const idxA = keyOrder!.indexOf(a.statusCode);
        const idxB = keyOrder!.indexOf(b.statusCode);
        // If not found in keyOrder, put at the end
        const posA = idxA === -1 ? keyOrder!.length : idxA;
        const posB = idxB === -1 ? keyOrder!.length : idxB;
        return posA - posB;
      });
    }

    return responses;
  }

  /**
   * Extract the order of response status code keys from the raw JSON string.
   * This is needed because JSON.parse sorts integer-like keys automatically.
   */
  private extractResponseKeyOrder(rawContent: string, pathStr: string, method: string): string[] | null {
    try {
      // Find the path key
      const pathKey = JSON.stringify(pathStr);
      const pathIdx = rawContent.indexOf(pathKey);
      if (pathIdx === -1) return null;

      // Find the method key after the path
      const methodKey = JSON.stringify(method);
      const methodIdx = rawContent.indexOf(methodKey, pathIdx);
      if (methodIdx === -1) return null;

      // Find "responses" after the method
      const responsesIdx = rawContent.indexOf('"responses"', methodIdx);
      if (responsesIdx === -1) return null;

      // Make sure this "responses" belongs to the current operation
      const nextMethodPatterns = ['"get"', '"post"', '"put"', '"delete"', '"patch"', '"options"', '"head"'];
      for (const mp of nextMethodPatterns) {
        if (mp === methodKey) continue;
        const nextMethodIdx = rawContent.indexOf(mp, methodIdx + methodKey.length);
        if (nextMethodIdx !== -1 && nextMethodIdx < responsesIdx) {
          return null;
        }
      }

      // Find the opening brace of the responses object
      const colonIdx = rawContent.indexOf(':', responsesIdx + '"responses"'.length);
      if (colonIdx === -1) return null;
      const braceStart = rawContent.indexOf('{', colonIdx + 1);
      if (braceStart === -1) return null;

      // Find matching closing brace
      let braceCount = 1;
      let braceEnd = braceStart + 1;
      while (braceEnd < rawContent.length && braceCount > 0) {
        const ch = rawContent[braceEnd];
        if (ch === '{') braceCount++;
        else if (ch === '}') braceCount--;
        if (braceCount > 0) braceEnd++;
      }
      if (braceCount !== 0) return null;

      // Extract the responses block
      const responsesBlock = rawContent.substring(braceStart, braceEnd + 1);

      // Extract top-level keys from the responses block in order of appearance
      // Match keys at the first nesting level only
      const keys: string[] = [];
      let depth = 0;
      let i = 0;
      while (i < responsesBlock.length) {
        const ch = responsesBlock[i];
        if (ch === '{' || ch === '[') {
          depth++;
        } else if (ch === '}' || ch === ']') {
          depth--;
        } else if (ch === '"' && depth === 1) {
          // This is a top-level key
          const keyEnd = responsesBlock.indexOf('"', i + 1);
          if (keyEnd === -1) break;
          const key = responsesBlock.substring(i + 1, keyEnd);
          // Check that a colon follows (it's a key, not a value)
          const afterKey = responsesBlock.substring(keyEnd + 1).trimStart();
          if (afterKey[0] === ':') {
            keys.push(key);
          }
          i = keyEnd + 1;
          continue;
        }
        i++;
      }

      return keys.length > 0 ? keys : null;
    } catch {
      return null;
    }
  }

  private extractSchema(
    schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | OpenAPIV2.SchemaObject | undefined,
    spec: OpenAPI.Document,
    filePath?: string
  ): SchemaObject | undefined {
    if (!schema) return undefined;

    // Capture the $ref name before resolving
    const refObj = schema as { $ref?: string };
    let refName: string | undefined;
    if (refObj.$ref) {
      // Check if it's an external ref (doesn't start with #)
      if (!refObj.$ref.startsWith('#') && filePath) {
        const externalResolved = this.resolveExternalRef(refObj.$ref, filePath, spec);
        if (externalResolved) {
          // Extract the last part of the path as the ref name
          const refParts = refObj.$ref.split('/');
          refName = this.decodeJsonPointer(refParts[refParts.length - 1]);
          // Process the externally resolved schema
          const result = this.extractSchema(externalResolved as OpenAPIV3.SchemaObject, spec, filePath);
          if (result) {
            result.$ref = refName;
          }
          return result;
        }
      }
      // Extract component name from $ref like "#/components/schemas/User" or "#/definitions/User"
      const refParts = refObj.$ref.split('/');
      refName = refParts[refParts.length - 1];
    }

    const resolved = this.resolveRef(schema, spec) as OpenAPIV3.SchemaObject | OpenAPIV2.SchemaObject;
    if (!resolved) return undefined;

    // Handle allOf - merge all schemas into one
    const resolvedAny = resolved as Record<string, unknown>;
    if (resolvedAny.allOf && Array.isArray(resolvedAny.allOf)) {
      const extractedSchemas: SchemaObject[] = [];
      for (const subSchema of resolvedAny.allOf) {
        const extracted = this.extractSchema(subSchema as OpenAPIV3.SchemaObject, spec, filePath);
        if (extracted) {
          extractedSchemas.push(extracted);
        }
      }
      const merged = this.mergeAllOfSchemas(extractedSchemas);
      // Preserve any top-level properties from the original schema
      if (resolvedAny.type) merged.type = resolvedAny.type as string;
      if (resolvedAny.description) merged.description = resolvedAny.description as string;
      if (refName) merged.$ref = refName;
      return merged;
    }

    // Handle oneOf - preserve as array
    if (resolvedAny.oneOf && Array.isArray(resolvedAny.oneOf)) {
      const result: SchemaObject = {
        type: resolvedAny.type as string | undefined,
        description: resolvedAny.description as string | undefined,
        oneOf: []
      };
      for (const subSchema of resolvedAny.oneOf) {
        const extracted = this.extractSchema(subSchema as OpenAPIV3.SchemaObject, spec, filePath);
        if (extracted) {
          result.oneOf!.push(extracted);
        }
      }
      if (resolvedAny.discriminator) {
        result.discriminator = resolvedAny.discriminator as SchemaObject['discriminator'];
      }
      if (refName) result.$ref = refName;
      return result;
    }

    // Handle anyOf - preserve as array
    if (resolvedAny.anyOf && Array.isArray(resolvedAny.anyOf)) {
      const result: SchemaObject = {
        type: resolvedAny.type as string | undefined,
        description: resolvedAny.description as string | undefined,
        anyOf: []
      };
      for (const subSchema of resolvedAny.anyOf) {
        const extracted = this.extractSchema(subSchema as OpenAPIV3.SchemaObject, spec, filePath);
        if (extracted) {
          result.anyOf!.push(extracted);
        }
      }
      if (resolvedAny.discriminator) {
        result.discriminator = resolvedAny.discriminator as SchemaObject['discriminator'];
      }
      if (refName) result.$ref = refName;
      return result;
    }

    // Start with a shallow copy of all properties to preserve any custom/unknown fields
    const result: SchemaObject = { ...resolved } as SchemaObject;

    // Preserve the component name if this was a $ref
    if (refName) {
      result.$ref = refName;
    }

    // Recursively process nested properties
    if (resolved.properties) {
      result.properties = {};
      for (const [key, value] of Object.entries(resolved.properties)) {
        result.properties[key] = this.extractSchema(value, spec, filePath) || {};
      }
    }

    // Recursively process array items
    if ('items' in resolved && resolved.items) {
      result.items = this.extractSchema(resolved.items as OpenAPIV3.SchemaObject, spec, filePath);
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

  /**
   * Decode JSON Pointer escape sequences per RFC 6901
   * ~1 -> /
   * ~0 -> ~
   */
  private decodeJsonPointer(pointer: string): string {
    return pointer.replace(/~1/g, '/').replace(/~0/g, '~');
  }

  /**
   * Resolve external $ref paths (relative file references)
   * e.g., "../components/responses/successResponse/content/application~1json/schema"
   */
  private resolveExternalRef(
    refPath: string,
    currentFilePath: string,
    spec: OpenAPI.Document
  ): unknown {
    try {
      // Split into file path and JSON pointer parts
      const hashIndex = refPath.indexOf('#');
      let filePart: string;
      let pointerPart: string;

      if (hashIndex !== -1) {
        filePart = refPath.substring(0, hashIndex);
        pointerPart = refPath.substring(hashIndex + 1);
      } else {
        // No hash means the entire path is a file path with embedded pointer
        // e.g., "../components/responses/successResponse/content/application~1json/schema"
        filePart = refPath;
        pointerPart = '';
      }

      // If there's a file part, resolve and load the external file
      let targetSpec: unknown = spec;
      let foundFile = false;

      if (filePart) {
        const currentDir = path.dirname(currentFilePath);
        const externalFilePath = path.resolve(currentDir, filePart);

        // Check if it's a JSON file path or a path within the directory structure
        if (fs.existsSync(externalFilePath) && externalFilePath.endsWith('.json')) {
          const content = fs.readFileSync(externalFilePath, 'utf-8');
          targetSpec = JSON.parse(content);
          foundFile = true;
        } else {
          // Treat the entire refPath as a relative path within the project
          // Navigate through the directory structure
          const parts = refPath.split('/');
          let currentPath = currentDir;
          let jsonPointerParts: string[] = [];

          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (part === '..') {
              currentPath = path.dirname(currentPath);
            } else if (part === '.') {
              continue;
            } else {
              const testPath = path.join(currentPath, part);
              const testJsonPath = testPath.endsWith('.json') ? testPath : testPath + '.json';

              if (fs.existsSync(testJsonPath)) {
                const content = fs.readFileSync(testJsonPath, 'utf-8');
                targetSpec = JSON.parse(content);
                jsonPointerParts = parts.slice(i + 1);
                foundFile = true;
                break;
              } else if (fs.existsSync(testPath) && fs.statSync(testPath).isDirectory()) {
                currentPath = testPath;
              } else {
                // Remaining parts are JSON pointer
                jsonPointerParts = parts.slice(i);
                break;
              }
            }
          }

          if (jsonPointerParts.length > 0) {
            pointerPart = '/' + jsonPointerParts.join('/');
          }
        }
      }

      // If no external file was found, return undefined
      if (!foundFile && filePart) {
        this.outputChannel.appendLine(`External ref file not found: ${refPath}`);
        return undefined;
      }

      // Navigate the JSON pointer path
      if (pointerPart) {
        const pointerPath = pointerPart.replace(/^\//, '').split('/');
        let resolved: unknown = targetSpec;

        for (const part of pointerPath) {
          const decodedPart = this.decodeJsonPointer(part);
          if (resolved && typeof resolved === 'object') {
            resolved = (resolved as Record<string, unknown>)[decodedPart];
          } else {
            return undefined;
          }
        }

        // If resolution failed, try with 'components' prefix
        // This handles cases where the file has a components wrapper
        // e.g., ref is "/schemas/Product" but file structure is "/components/schemas/Product"
        if (resolved === undefined) {
          const targetSpecObj = targetSpec as Record<string, unknown>;
          if (targetSpecObj.components && typeof targetSpecObj.components === 'object') {
            resolved = targetSpecObj.components;
            for (const part of pointerPath) {
              const decodedPart = this.decodeJsonPointer(part);
              if (resolved && typeof resolved === 'object') {
                resolved = (resolved as Record<string, unknown>)[decodedPart];
              } else {
                return undefined;
              }
            }
          }
        }

        return resolved;
      }

      return targetSpec;
    } catch (error) {
      this.outputChannel.appendLine(`Error resolving external ref ${refPath}: ${error}`);
      return undefined;
    }
  }

  /**
   * Merge multiple schemas from allOf into a single flattened schema
   */
  private mergeAllOfSchemas(schemas: SchemaObject[]): SchemaObject {
    const merged: SchemaObject = {
      type: 'object',
      properties: {},
      required: [],
      _mergedFrom: []
    };

    for (const schema of schemas) {
      // Track source refs
      if (schema.$ref) {
        merged._mergedFrom!.push(schema.$ref);
      }

      // Merge type (prefer 'object' if any schema has it)
      if (schema.type) {
        merged.type = schema.type;
      }

      // Merge properties
      if (schema.properties) {
        merged.properties = { ...merged.properties, ...schema.properties };
      }

      // Merge required arrays
      if (schema.required) {
        merged.required = [...new Set([...merged.required!, ...schema.required])];
      }

      // Merge other scalar properties (last one wins)
      if (schema.description) merged.description = schema.description;
      if (schema.format) merged.format = schema.format;
      if (schema.example !== undefined) merged.example = schema.example;
      if (schema.default !== undefined) merged.default = schema.default;
      if (schema.nullable !== undefined) merged.nullable = schema.nullable;
      if (schema.readOnly !== undefined) merged.readOnly = schema.readOnly;
      if (schema.writeOnly !== undefined) merged.writeOnly = schema.writeOnly;
      if (schema.deprecated !== undefined) merged.deprecated = schema.deprecated;
      if (schema.discriminator) merged.discriminator = schema.discriminator;

      // Merge items for array types
      if (schema.items) merged.items = schema.items;
    }

    // Clean up empty arrays
    if (merged.required!.length === 0) delete merged.required;
    if (merged._mergedFrom!.length === 0) delete merged._mergedFrom;
    if (Object.keys(merged.properties!).length === 0) delete merged.properties;

    return merged;
  }

  private isOpenApiSpec(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object') return false;
    const spec = obj as Record<string, unknown>;
    return 'swagger' in spec || 'openapi' in spec;
  }

  private isSchemaFile(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object') return false;
    const spec = obj as Record<string, unknown>;
    if ('swagger' in spec || 'openapi' in spec) return false;
    const components = spec.components as Record<string, unknown> | undefined;
    return !!(components && typeof components === 'object' && (components.schemas || components.parameters));
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

  private extractComponents(spec: OpenAPI.Document, filePath?: string): Record<string, Record<string, SchemaObject>> | undefined {
    const result: Record<string, Record<string, SchemaObject>> = {};

    // OpenAPI 3.x components
    const v3Spec = spec as OpenAPIV3.Document;
    if (v3Spec.components) {
      if (v3Spec.components.schemas) {
        result.schemas = {};
        for (const [name, schema] of Object.entries(v3Spec.components.schemas)) {
          result.schemas[name] = this.extractSchema(schema, spec, filePath) || {};
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
            const schemaObj = resolved.schema as OpenAPIV3.SchemaObject | undefined;
            result.parameters[name] = {
              type: schemaObj?.type || 'string',
              format: schemaObj?.format,
              description: resolved.description,
              example: resolved.example,
              deprecated: resolved.deprecated,
              enum: schemaObj?.enum as unknown[],
              default: schemaObj?.default,
              pattern: schemaObj?.pattern,
              minimum: schemaObj?.minimum,
              maximum: schemaObj?.maximum,
              minLength: schemaObj?.minLength,
              maxLength: schemaObj?.maxLength,
              _paramIn: resolved.in as 'path' | 'query' | 'header' | 'cookie',
              _paramRequired: resolved.required,
              _paramName: resolved.name,
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
        result.schemas[name] = this.extractSchema(schema, spec, filePath) || {};
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
      await fs.promises.writeFile(filePath, updatedContent, { encoding: 'utf-8', flag: 'w' });

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
      await fs.promises.writeFile(filePath, updatedContent, { encoding: 'utf-8', flag: 'w' });

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
      await fs.promises.writeFile(filePath, updatedContent, { encoding: 'utf-8', flag: 'w' });

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
      await fs.promises.writeFile(filePath, updatedContent, { encoding: 'utf-8', flag: 'w' });

      // Clear cache for this file so it gets re-parsed
      this.removeFromCache(filePath);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error deleting parameter: ${message}`);
      return { success: false, message };
    }
  }

  async updateRequestBody(
    filePath: string,
    endpointPath: string,
    method: string,
    requestBody: object | null
  ): Promise<{ success: boolean; message?: string }> {
    try {
      this.outputChannel.appendLine(`[updateRequestBody] filePath: ${filePath}, path: ${endpointPath}, method: ${method}`);
      this.outputChannel.appendLine(`[updateRequestBody] requestBody: ${JSON.stringify(requestBody)}`);

      const content = await fs.promises.readFile(filePath, 'utf-8');
      const spec = JSON.parse(content);

      const pathObj = spec.paths?.[endpointPath];
      if (!pathObj) {
        this.outputChannel.appendLine(`[updateRequestBody] Path not found: ${endpointPath}`);
        return { success: false, message: `Path ${endpointPath} not found in spec` };
      }

      const operation = pathObj[method.toLowerCase()];
      if (!operation) {
        this.outputChannel.appendLine(`[updateRequestBody] Method not found: ${method}`);
        return { success: false, message: `Method ${method} not found on path ${endpointPath}` };
      }

      if (requestBody === null) {
        delete operation.requestBody;
      } else {
        operation.requestBody = requestBody;
      }

      const updatedContent = JSON.stringify(spec, null, 2);
      await fs.promises.writeFile(filePath, updatedContent, { encoding: 'utf-8', flag: 'w' });

      this.outputChannel.appendLine(`[updateRequestBody] Successfully saved to ${filePath}`);
      this.removeFromCache(filePath);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error updating request body: ${message}`);
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
      await fs.promises.writeFile(filePath, updatedContent, { encoding: 'utf-8', flag: 'w' });

      // Clear cache for this file so it gets re-parsed
      this.removeFromCache(filePath);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error updating path: ${message}`);
      return { success: false, message };
    }
  }

  async updateMethod(
    filePath: string,
    path: string,
    oldMethod: string,
    newMethod: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      // Read the raw file content
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const spec = JSON.parse(content);

      // Check if path exists
      if (!spec.paths?.[path]) {
        return { success: false, message: `Path ${path} not found in spec` };
      }

      const pathObj = spec.paths[path];
      const oldMethodLower = oldMethod.toLowerCase();
      const newMethodLower = newMethod.toLowerCase();

      // Check if old method exists on this path
      if (!pathObj[oldMethodLower]) {
        return { success: false, message: `Method ${oldMethod} not found for path ${path}` };
      }

      // If method is not changing, nothing to do
      if (oldMethodLower === newMethodLower) {
        return { success: true };
      }

      // Check if new method already exists on this path
      if (pathObj[newMethodLower]) {
        return { success: false, message: `${newMethod.toUpperCase()} ${path} already exists in spec` };
      }

      // Move the operation to the new method
      pathObj[newMethodLower] = pathObj[oldMethodLower];

      // Remove the old method
      delete pathObj[oldMethodLower];

      // Write the updated spec back to file
      const updatedContent = JSON.stringify(spec, null, 2);
      await fs.promises.writeFile(filePath, updatedContent, { encoding: 'utf-8', flag: 'w' });

      // Clear cache for this file so it gets re-parsed
      this.removeFromCache(filePath);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error updating method: ${message}`);
      return { success: false, message };
    }
  }

  async addServer(
    filePath: string,
    server: { url: string; description?: string }
  ): Promise<{ success: boolean; message?: string; servers?: { url: string; description?: string }[] }> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const spec = JSON.parse(content);

      // Initialize servers array if it doesn't exist
      if (!spec.servers) {
        spec.servers = [];
      }

      // Check for duplicate URL
      const exists = spec.servers.some((s: { url: string }) => s.url === server.url);
      if (exists) {
        return { success: false, message: `Server with URL ${server.url} already exists` };
      }

      // Add the new server
      const newServer: { url: string; description?: string } = { url: server.url };
      if (server.description) {
        newServer.description = server.description;
      }
      spec.servers.push(newServer);

      // Write the updated spec back to file
      const updatedContent = JSON.stringify(spec, null, 2);
      await fs.promises.writeFile(filePath, updatedContent, { encoding: 'utf-8', flag: 'w' });

      this.removeFromCache(filePath);

      return { success: true, servers: spec.servers };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error adding server: ${message}`);
      return { success: false, message };
    }
  }

  async updateServer(
    filePath: string,
    index: number,
    server: { url: string; description?: string }
  ): Promise<{ success: boolean; message?: string; servers?: { url: string; description?: string }[] }> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const spec = JSON.parse(content);

      if (!spec.servers || index < 0 || index >= spec.servers.length) {
        return { success: false, message: `Server at index ${index} not found` };
      }

      // Check for duplicate URL (excluding current server)
      const duplicateIndex = spec.servers.findIndex(
        (s: { url: string }, i: number) => s.url === server.url && i !== index
      );
      if (duplicateIndex !== -1) {
        return { success: false, message: `Server with URL ${server.url} already exists` };
      }

      // Update the server
      spec.servers[index] = { url: server.url };
      if (server.description) {
        spec.servers[index].description = server.description;
      }

      // Write the updated spec back to file
      const updatedContent = JSON.stringify(spec, null, 2);
      await fs.promises.writeFile(filePath, updatedContent, { encoding: 'utf-8', flag: 'w' });

      this.removeFromCache(filePath);

      return { success: true, servers: spec.servers };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error updating server: ${message}`);
      return { success: false, message };
    }
  }

  async deleteServer(
    filePath: string,
    index: number
  ): Promise<{ success: boolean; message?: string; servers?: { url: string; description?: string }[] }> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const spec = JSON.parse(content);

      if (!spec.servers || index < 0 || index >= spec.servers.length) {
        return { success: false, message: `Server at index ${index} not found` };
      }

      // Remove the server
      spec.servers.splice(index, 1);

      // If servers array is empty, remove it
      if (spec.servers.length === 0) {
        delete spec.servers;
      }

      // Write the updated spec back to file
      const updatedContent = JSON.stringify(spec, null, 2);
      await fs.promises.writeFile(filePath, updatedContent, { encoding: 'utf-8', flag: 'w' });

      this.removeFromCache(filePath);

      return { success: true, servers: spec.servers || [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error deleting server: ${message}`);
      return { success: false, message };
    }
  }

  async updateApiInfo(
    filePath: string,
    updates: { title?: string; description?: string; version?: string }
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const spec = JSON.parse(content);

      if (!spec.info) {
        spec.info = {};
      }

      if (updates.title !== undefined) {
        spec.info.title = updates.title || undefined;
      }
      if (updates.description !== undefined) {
        spec.info.description = updates.description || undefined;
      }
      if (updates.version !== undefined) {
        spec.info.version = updates.version || undefined;
      }

      const updatedContent = JSON.stringify(spec, null, 2);
      await fs.promises.writeFile(filePath, updatedContent, { encoding: 'utf-8', flag: 'w' });

      this.removeFromCache(filePath);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error updating API info: ${message}`);
      return { success: false, message };
    }
  }

  async addEndpoint(
    filePath: string,
    endpointPath: string,
    method: string,
    summary?: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const spec = JSON.parse(content);

      // Initialize paths object if it doesn't exist
      if (!spec.paths) {
        spec.paths = {};
      }

      // Initialize path object if it doesn't exist
      if (!spec.paths[endpointPath]) {
        spec.paths[endpointPath] = {};
      }

      // Check if method already exists for this path
      if (spec.paths[endpointPath][method.toLowerCase()]) {
        return { success: false, message: `${method.toUpperCase()} ${endpointPath} already exists` };
      }

      // Create the new endpoint operation
      const operation: Record<string, unknown> = {
        responses: {
          '200': {
            description: 'Successful response'
          }
        }
      };

      if (summary) {
        operation.summary = summary;
      }

      // Add the endpoint
      spec.paths[endpointPath][method.toLowerCase()] = operation;

      // Write the updated spec back to file
      const updatedContent = JSON.stringify(spec, null, 2);
      await fs.promises.writeFile(filePath, updatedContent, { encoding: 'utf-8', flag: 'w' });

      this.removeFromCache(filePath);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error adding endpoint: ${message}`);
      return { success: false, message };
    }
  }

  async addModel(
    filePath: string,
    modelName: string,
    modelType: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const spec = JSON.parse(content);

      // Determine if this is OpenAPI 3.x, 2.x, or schema-only file
      const isV3 = spec.openapi !== undefined;
      const isSchemaOnly = !spec.openapi && !spec.swagger && spec.components?.schemas;

      if (isV3 || isSchemaOnly) {
        // OpenAPI 3.x uses components.schemas
        if (!spec.components) {
          spec.components = {};
        }
        if (!spec.components.schemas) {
          spec.components.schemas = {};
        }

        // Check if model already exists
        if (spec.components.schemas[modelName]) {
          return { success: false, message: `Model "${modelName}" already exists` };
        }

        // Create the model schema based on type
        const schema = this.createModelSchema(modelType);
        spec.components.schemas[modelName] = schema;
      } else {
        // OpenAPI 2.x uses definitions
        if (!spec.definitions) {
          spec.definitions = {};
        }

        // Check if model already exists
        if (spec.definitions[modelName]) {
          return { success: false, message: `Model "${modelName}" already exists` };
        }

        // Create the model schema based on type
        const schema = this.createModelSchema(modelType);
        spec.definitions[modelName] = schema;
      }

      // Write the updated spec back to file
      const updatedContent = JSON.stringify(spec, null, 2);
      await fs.promises.writeFile(filePath, updatedContent, { encoding: 'utf-8', flag: 'w' });

      this.removeFromCache(filePath);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error adding model: ${message}`);
      return { success: false, message };
    }
  }

  private createModelSchema(modelType: string): Record<string, unknown> {
    switch (modelType) {
      case 'object':
        return {
          type: 'object',
          properties: {},
          required: []
        };
      case 'array':
        return {
          type: 'array',
          items: {
            type: 'object'
          }
        };
      case 'string':
        return {
          type: 'string'
        };
      case 'integer':
        return {
          type: 'integer'
        };
      case 'number':
        return {
          type: 'number'
        };
      case 'boolean':
        return {
          type: 'boolean'
        };
      default:
        return {
          type: 'object',
          properties: {}
        };
    }
  }

  private getSchemasObject(spec: Record<string, unknown>): Record<string, unknown> | null {
    if (spec.openapi) {
      return (spec as Record<string, Record<string, Record<string, unknown>>>).components?.schemas || null;
    } else if (spec.swagger) {
      return (spec as Record<string, Record<string, unknown>>).definitions || null;
    } else if ((spec.components as Record<string, unknown>)?.schemas) {
      return (spec.components as Record<string, Record<string, unknown>>).schemas;
    }
    return null;
  }

  async deleteSchema(
    filePath: string,
    schemaName: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const spec = JSON.parse(content);

      const schemas = this.getSchemasObject(spec);
      if (!schemas || !schemas[schemaName]) {
        return { success: false, message: `Schema "${schemaName}" not found` };
      }

      delete schemas[schemaName];

      const updatedContent = JSON.stringify(spec, null, 2);
      await fs.promises.writeFile(filePath, updatedContent, { encoding: 'utf-8', flag: 'w' });
      this.removeFromCache(filePath);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error deleting schema: ${message}`);
      return { success: false, message };
    }
  }

  async addSchemaProperty(
    filePath: string,
    schemaName: string,
    property: {
      name: string; type: string; description?: string; required?: boolean;
      format?: string; example?: unknown; default?: unknown; enum?: unknown[];
      nullable?: boolean; deprecated?: boolean; readOnly?: boolean; writeOnly?: boolean;
      pattern?: string; minLength?: number; maxLength?: number;
      minimum?: number; maximum?: number; exclusiveMinimum?: boolean | number; exclusiveMaximum?: boolean | number;
      minItems?: number; maxItems?: number; uniqueItems?: boolean;
    }
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const spec = JSON.parse(content);

      const schemas = this.getSchemasObject(spec);
      if (!schemas || !schemas[schemaName]) {
        return { success: false, message: `Schema "${schemaName}" not found` };
      }

      const schema = schemas[schemaName] as Record<string, unknown>;
      if (!schema.properties) {
        schema.properties = {};
      }

      const props = schema.properties as Record<string, unknown>;
      if (props[property.name]) {
        return { success: false, message: `Property "${property.name}" already exists` };
      }

      const propDef: Record<string, unknown> = { type: property.type };
      if (property.description) {
        propDef.description = property.description;
      }
      const commonFields = ['format', 'example', 'default', 'enum', 'nullable', 'deprecated', 'readOnly', 'writeOnly', 'pattern', 'minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minItems', 'maxItems', 'uniqueItems'] as const;
      for (const field of commonFields) {
        if ((property as Record<string, unknown>)[field] !== undefined) {
          propDef[field] = (property as Record<string, unknown>)[field];
        }
      }
      props[property.name] = propDef;

      if (property.required) {
        if (!Array.isArray(schema.required)) {
          schema.required = [];
        }
        (schema.required as string[]).push(property.name);
      }

      const updatedContent = JSON.stringify(spec, null, 2);
      await fs.promises.writeFile(filePath, updatedContent, { encoding: 'utf-8', flag: 'w' });
      this.removeFromCache(filePath);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error adding property: ${message}`);
      return { success: false, message };
    }
  }

  async deleteSchemaProperty(
    filePath: string,
    schemaName: string,
    propertyName: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const spec = JSON.parse(content);

      const schemas = this.getSchemasObject(spec);
      if (!schemas || !schemas[schemaName]) {
        return { success: false, message: `Schema "${schemaName}" not found` };
      }

      const schema = schemas[schemaName] as Record<string, unknown>;
      const props = schema.properties as Record<string, unknown> | undefined;
      if (!props || !props[propertyName]) {
        return { success: false, message: `Property "${propertyName}" not found` };
      }

      delete props[propertyName];

      // Remove from required array if present
      if (Array.isArray(schema.required)) {
        schema.required = (schema.required as string[]).filter(r => r !== propertyName);
        if ((schema.required as string[]).length === 0) {
          schema.required = [];
        }
      }

      const updatedContent = JSON.stringify(spec, null, 2);
      await fs.promises.writeFile(filePath, updatedContent, { encoding: 'utf-8', flag: 'w' });
      this.removeFromCache(filePath);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error deleting property: ${message}`);
      return { success: false, message };
    }
  }

  async updateSchemaProperty(
    filePath: string,
    schemaName: string,
    propertyName: string,
    updates: {
      name?: string; type?: string; description?: string; required?: boolean;
      format?: string | null; example?: unknown | null; default?: unknown | null; enum?: unknown[] | null;
      nullable?: boolean | null; deprecated?: boolean | null; readOnly?: boolean | null; writeOnly?: boolean | null;
      pattern?: string | null; minLength?: number | null; maxLength?: number | null;
      minimum?: number | null; maximum?: number | null; exclusiveMinimum?: boolean | number | null; exclusiveMaximum?: boolean | number | null;
      minItems?: number | null; maxItems?: number | null; uniqueItems?: boolean | null;
    }
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const spec = JSON.parse(content);

      const schemas = this.getSchemasObject(spec);
      if (!schemas || !schemas[schemaName]) {
        return { success: false, message: `Schema "${schemaName}" not found` };
      }

      const schema = schemas[schemaName] as Record<string, unknown>;
      const props = schema.properties as Record<string, unknown> | undefined;
      if (!props || !props[propertyName]) {
        return { success: false, message: `Property "${propertyName}" not found` };
      }

      const propDef = props[propertyName] as Record<string, unknown>;

      // Update type
      if (updates.type !== undefined) {
        propDef.type = updates.type;
      }

      // Update description
      if (updates.description !== undefined) {
        if (updates.description) {
          propDef.description = updates.description;
        } else {
          delete propDef.description;
        }
      }

      // Handle rename
      if (updates.name && updates.name !== propertyName) {
        if (props[updates.name]) {
          return { success: false, message: `Property "${updates.name}" already exists` };
        }
        // Preserve key order by rebuilding
        const newProps: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(props)) {
          if (key === propertyName) {
            newProps[updates.name] = value;
          } else {
            newProps[key] = value;
          }
        }
        schema.properties = newProps;

        // Update required array
        if (Array.isArray(schema.required)) {
          schema.required = (schema.required as string[]).map(r => r === propertyName ? updates.name! : r);
        }
      }

      // Update required status
      if (updates.required !== undefined) {
        if (!Array.isArray(schema.required)) {
          schema.required = [];
        }
        const reqArr = schema.required as string[];
        const propName = updates.name || propertyName;
        const idx = reqArr.indexOf(propName);
        if (updates.required && idx === -1) {
          reqArr.push(propName);
        } else if (!updates.required && idx !== -1) {
          reqArr.splice(idx, 1);
        }
      }

      // Update common schema fields
      const commonFields = ['format', 'example', 'default', 'enum', 'nullable', 'deprecated', 'readOnly', 'writeOnly', 'pattern', 'minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minItems', 'maxItems', 'uniqueItems'] as const;
      for (const field of commonFields) {
        const value = (updates as Record<string, unknown>)[field];
        if (value === null) {
          delete propDef[field];
        } else if (value !== undefined) {
          propDef[field] = value;
        }
      }

      const updatedContent = JSON.stringify(spec, null, 2);
      await fs.promises.writeFile(filePath, updatedContent, { encoding: 'utf-8', flag: 'w' });
      this.removeFromCache(filePath);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error updating property: ${message}`);
      return { success: false, message };
    }
  }

  async updateFullSchema(
    filePath: string,
    schemaName: string,
    schema: Record<string, unknown>
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const spec = JSON.parse(content);

      const schemas = this.getSchemasObject(spec);
      if (!schemas) {
        return { success: false, message: 'No schemas section found' };
      }

      if (!schemas[schemaName]) {
        return { success: false, message: `Schema "${schemaName}" not found` };
      }

      // Preserve non-property fields from the existing schema (like 'type', 'title', 'description' at schema level)
      const existingSchema = schemas[schemaName] as Record<string, unknown>;
      const updatedSchema: Record<string, unknown> = {
        ...existingSchema,
        type: schema.type || existingSchema.type || 'object',
        properties: schema.properties || {},
      };

      // Update required array
      if (schema.required && Array.isArray(schema.required) && (schema.required as unknown[]).length > 0) {
        updatedSchema.required = schema.required;
      } else {
        delete updatedSchema.required;
      }

      schemas[schemaName] = updatedSchema;

      const updatedContent = JSON.stringify(spec, null, 2);
      await fs.promises.writeFile(filePath, updatedContent, { encoding: 'utf-8', flag: 'w' });
      this.removeFromCache(filePath);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error updating full schema: ${message}`);
      return { success: false, message };
    }
  }

  async addComponentParameter(
    filePath: string,
    paramKey: string,
    parameter: {
      name: string;
      in: string;
      type: string;
      required?: boolean;
      description?: string;
      example?: unknown;
      deprecated?: boolean;
      format?: string;
    }
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const spec = JSON.parse(content);

      if (!spec.components) {
        spec.components = {};
      }
      if (!spec.components.parameters) {
        spec.components.parameters = {};
      }

      if (spec.components.parameters[paramKey]) {
        return { success: false, message: `Parameter "${paramKey}" already exists` };
      }

      const paramObj: Record<string, unknown> = {
        name: parameter.name,
        in: parameter.in,
        schema: { type: parameter.type },
      };
      if (parameter.required) { paramObj.required = true; }
      if (parameter.description) { paramObj.description = parameter.description; }
      if (parameter.example !== undefined) { paramObj.example = parameter.example; }
      if (parameter.deprecated) { paramObj.deprecated = true; }
      if (parameter.format) { (paramObj.schema as Record<string, unknown>).format = parameter.format; }

      spec.components.parameters[paramKey] = paramObj;

      const updatedContent = JSON.stringify(spec, null, 2);
      await fs.promises.writeFile(filePath, updatedContent, { encoding: 'utf-8', flag: 'w' });
      this.removeFromCache(filePath);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error adding component parameter: ${message}`);
      return { success: false, message };
    }
  }

  async deleteComponentParameter(
    filePath: string,
    paramKey: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const spec = JSON.parse(content);

      if (!spec.components?.parameters?.[paramKey]) {
        return { success: false, message: `Parameter "${paramKey}" not found` };
      }

      delete spec.components.parameters[paramKey];

      if (Object.keys(spec.components.parameters).length === 0) {
        delete spec.components.parameters;
      }

      const updatedContent = JSON.stringify(spec, null, 2);
      await fs.promises.writeFile(filePath, updatedContent, { encoding: 'utf-8', flag: 'w' });
      this.removeFromCache(filePath);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error deleting component parameter: ${message}`);
      return { success: false, message };
    }
  }

  async updateComponentParameter(
    filePath: string,
    paramKey: string,
    updates: Record<string, unknown>
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const spec = JSON.parse(content);

      const param = spec.components?.parameters?.[paramKey];
      if (!param) {
        return { success: false, message: `Parameter "${paramKey}" not found` };
      }

      // Parameter-level fields
      const paramFields = ['name', 'in', 'required', 'description', 'example', 'deprecated'];
      for (const field of paramFields) {
        if (field in updates) {
          if (updates[field] === null || updates[field] === undefined) {
            delete param[field];
          } else {
            param[field] = updates[field];
          }
        }
      }

      // Schema-level fields
      const schemaFields = ['type', 'format', 'enum', 'default', 'pattern', 'minimum', 'maximum', 'minLength', 'maxLength', 'exclusiveMinimum', 'exclusiveMaximum', 'minItems', 'maxItems', 'uniqueItems', 'nullable'];
      if (!param.schema) { param.schema = {}; }
      for (const field of schemaFields) {
        if (field in updates) {
          if (updates[field] === null || updates[field] === undefined) {
            delete param.schema[field];
          } else {
            param.schema[field] = updates[field];
          }
        }
      }

      // Handle key rename
      if (updates.newKey && updates.newKey !== paramKey) {
        const newKey = updates.newKey as string;
        if (spec.components.parameters[newKey]) {
          return { success: false, message: `Parameter "${newKey}" already exists` };
        }
        // Preserve key order by rebuilding the object
        const newParams: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(spec.components.parameters)) {
          if (key === paramKey) {
            newParams[newKey] = val;
          } else {
            newParams[key] = val;
          }
        }
        spec.components.parameters = newParams;
      }

      const updatedContent = JSON.stringify(spec, null, 2);
      await fs.promises.writeFile(filePath, updatedContent, { encoding: 'utf-8', flag: 'w' });
      this.removeFromCache(filePath);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error updating component parameter: ${message}`);
      return { success: false, message };
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  removeFromCache(filePath: string): void {
    this.cache.delete(filePath);
  }

  async createFolder(parentPath: string, folderName: string): Promise<{ success: boolean; path?: string; message?: string }> {
    try {
      const newFolderPath = path.join(parentPath, folderName);

      if (fs.existsSync(newFolderPath)) {
        return { success: false, message: `Folder "${folderName}" already exists` };
      }

      await fs.promises.mkdir(newFolderPath, { recursive: true });

      return { success: true, path: newFolderPath };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error creating folder: ${message}`);
      return { success: false, message };
    }
  }

  async createFile(parentPath: string, fileName: string): Promise<{ success: boolean; path?: string; message?: string }> {
    try {
      // Ensure the file has .json extension
      const finalFileName = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
      const newFilePath = path.join(parentPath, finalFileName);

      if (fs.existsSync(newFilePath)) {
        return { success: false, message: `File "${finalFileName}" already exists` };
      }

      // Create a basic OpenAPI 3.0 template
      const template = {
        openapi: "3.0.3",
        info: {
          title: fileName.replace(/\.json$/, ''),
          version: "1.0.0",
          description: ""
        },
        servers: [],
        paths: {}
      };

      await fs.promises.writeFile(newFilePath, JSON.stringify(template, null, 2), 'utf-8');

      return { success: true, path: newFilePath };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error creating file: ${message}`);
      return { success: false, message };
    }
  }

  async deleteItem(itemPath: string): Promise<{ success: boolean; message?: string }> {
    try {
      if (!fs.existsSync(itemPath)) {
        return { success: false, message: `Item not found: ${itemPath}` };
      }

      const stat = fs.statSync(itemPath);

      if (stat.isDirectory()) {
        await fs.promises.rm(itemPath, { recursive: true, force: true });
      } else {
        await fs.promises.unlink(itemPath);
        // Remove from cache if it's a file
        this.removeFromCache(itemPath);
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error deleting item: ${message}`);
      return { success: false, message };
    }
  }

  // ==================== Response CRUD Methods ====================

  async addResponse(
    filePath: string,
    endpointPath: string,
    method: string,
    response: {
      statusCode: string;
      description?: string;
      contentType?: string;
      schema?: object;
    }
  ): Promise<{ success: boolean; message?: string }> {
    return this.withWriteLock(filePath, async () => {
      try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const spec = JSON.parse(content);

        const pathObj = spec.paths?.[endpointPath];
        if (!pathObj) {
          return { success: false, message: `Path ${endpointPath} not found in spec` };
        }

        const operation = pathObj[method.toLowerCase()];
        if (!operation) {
          return { success: false, message: `Method ${method} not found for path ${endpointPath}` };
        }

        // Initialize responses object if it doesn't exist
        if (!operation.responses) {
          operation.responses = {};
        }

        // Check for duplicate status code
        if (operation.responses[response.statusCode]) {
          return { success: false, message: `Response ${response.statusCode} already exists` };
        }

        // Create the new response object
        const newResponse: Record<string, unknown> = {
          description: response.description || `Response for status ${response.statusCode}`
        };

        // Add content if contentType and schema provided
        if (response.contentType && response.schema) {
          newResponse.content = {
            [response.contentType]: {
              schema: response.schema
            }
          };
        } else if (response.contentType) {
          newResponse.content = {
            [response.contentType]: {
              schema: { type: 'object' }
            }
          };
        }

        operation.responses[response.statusCode] = newResponse;

        const updatedContent = JSON.stringify(spec, null, 2);
        await fs.promises.writeFile(filePath, updatedContent, { encoding: 'utf-8', flag: 'w' });

        this.removeFromCache(filePath);

        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.outputChannel.appendLine(`Error adding response: ${message}`);
        return { success: false, message };
      }
    });
  }

  async updateResponse(
    filePath: string,
    endpointPath: string,
    method: string,
    statusCode: string,
    updates: {
      statusCode?: string;
      description?: string;
      contentType?: string;
      schema?: object;
      headers?: object;
      examples?: object;
    }
  ): Promise<{ success: boolean; message?: string }> {
    return this.withWriteLock(filePath, async () => {
      try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const spec = JSON.parse(content);

        const pathObj = spec.paths?.[endpointPath];
        if (!pathObj) {
          return { success: false, message: `Path ${endpointPath} not found in spec` };
        }

        const operation = pathObj[method.toLowerCase()];
        if (!operation) {
          return { success: false, message: `Method ${method} not found for path ${endpointPath}` };
        }

        if (!operation.responses || !operation.responses[statusCode]) {
          return { success: false, message: `Response ${statusCode} not found` };
        }

        const response = operation.responses[statusCode];

        // Update description
        if (updates.description !== undefined) {
          response.description = updates.description;
        }

        // Update content type and schema
        if (updates.contentType !== undefined || updates.schema !== undefined) {
          if (!response.content) {
            response.content = {};
          }

          const currentContentType = Object.keys(response.content)[0] || 'application/json';
          const targetContentType = updates.contentType || currentContentType;

          // If content type changed, move the content
          if (updates.contentType && updates.contentType !== currentContentType && response.content[currentContentType]) {
            response.content[targetContentType] = response.content[currentContentType];
            delete response.content[currentContentType];
          }

          // Ensure target content type exists
          if (!response.content[targetContentType]) {
            response.content[targetContentType] = {};
          }

          // Update schema
          if (updates.schema !== undefined) {
            response.content[targetContentType].schema = updates.schema;
          }
        }

        // Update headers
        if (updates.headers !== undefined) {
          if (Object.keys(updates.headers).length > 0) {
            response.headers = updates.headers;
          } else {
            delete response.headers;
          }
        }

        // Update examples
        if (updates.examples !== undefined) {
          const contentType = Object.keys(response.content || {})[0];
          if (contentType && response.content[contentType]) {
            if (Object.keys(updates.examples).length > 0) {
              response.content[contentType].examples = updates.examples;
            } else {
              delete response.content[contentType].examples;
            }
          }
        }

        // Handle status code change (must be last as it changes the key)
        if (updates.statusCode && updates.statusCode !== statusCode) {
          // Check if new status code already exists
          if (operation.responses[updates.statusCode]) {
            return { success: false, message: `Response ${updates.statusCode} already exists` };
          }

          // Preserve order by rebuilding the responses object
          const newResponses: Record<string, unknown> = {};
          for (const [code, resp] of Object.entries(operation.responses)) {
            if (code === statusCode) {
              newResponses[updates.statusCode] = resp;
            } else {
              newResponses[code] = resp;
            }
          }
          operation.responses = newResponses;
        }

        const updatedContent = JSON.stringify(spec, null, 2);
        await fs.promises.writeFile(filePath, updatedContent, { encoding: 'utf-8', flag: 'w' });

        this.removeFromCache(filePath);

        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.outputChannel.appendLine(`Error updating response: ${message}`);
        return { success: false, message };
      }
    });
  }

  async deleteResponse(
    filePath: string,
    endpointPath: string,
    method: string,
    statusCode: string
  ): Promise<{ success: boolean; message?: string }> {
    return this.withWriteLock(filePath, async () => {
      try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const spec = JSON.parse(content);

        const pathObj = spec.paths?.[endpointPath];
        if (!pathObj) {
          return { success: false, message: `Path ${endpointPath} not found in spec` };
        }

        const operation = pathObj[method.toLowerCase()];
        if (!operation) {
          return { success: false, message: `Method ${method} not found for path ${endpointPath}` };
        }

        if (!operation.responses || !operation.responses[statusCode]) {
          return { success: false, message: `Response ${statusCode} not found` };
        }

        delete operation.responses[statusCode];

        // If responses object is empty, keep at least one default response
        if (Object.keys(operation.responses).length === 0) {
          operation.responses = {
            '200': { description: 'Successful response' }
          };
        }

        const updatedContent = JSON.stringify(spec, null, 2);
        await fs.promises.writeFile(filePath, updatedContent, { encoding: 'utf-8', flag: 'w' });

        this.removeFromCache(filePath);

        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.outputChannel.appendLine(`Error deleting response: ${message}`);
        return { success: false, message };
      }
    });
  }

  async reorderResponses(
    filePath: string,
    endpointPath: string,
    method: string,
    orderedStatusCodes: string[]
  ): Promise<{ success: boolean; message?: string }> {
    this.outputChannel.appendLine(`[reorderResponses] Called with path=${endpointPath}, method=${method}, order=${orderedStatusCodes.join(',')}`);
    return this.withWriteLock(filePath, async () => {
      try {
        const content = await fs.promises.readFile(filePath, 'utf-8');

        // Use regex to reorder the responses block directly in the JSON string,
        // because JSON.parse + Object reorders integer-like keys (e.g. "200", "404")
        // automatically in V8, losing user-specified order.
        const updatedContent = this.reorderResponseKeysInJson(
          content, endpointPath, method.toLowerCase(), orderedStatusCodes
        );

        if (!updatedContent) {
          return { success: false, message: 'Failed to reorder responses in JSON' };
        }

        // Validate the result is still valid JSON
        JSON.parse(updatedContent);

        await fs.promises.writeFile(filePath, updatedContent, { encoding: 'utf-8', flag: 'w' });
        this.removeFromCache(filePath);

        this.outputChannel.appendLine(`[reorderResponses] Successfully saved new order: ${orderedStatusCodes.join(',')}`);
        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.outputChannel.appendLine(`Error reordering responses: ${message}`);
        return { success: false, message };
      }
    });
  }

  /**
   * Reorder response keys directly in the JSON string to avoid V8's automatic
   * sorting of integer-like object keys.
   */
  private reorderResponseKeysInJson(
    jsonContent: string,
    endpointPath: string,
    method: string,
    orderedStatusCodes: string[]
  ): string | null {
    try {
      // Parse to find the responses object location and values
      const spec = JSON.parse(jsonContent);
      const operation = spec.paths?.[endpointPath]?.[method];
      if (!operation?.responses) {
        return null;
      }

      const oldResponses = operation.responses;

      // Build ordered entries: [key, value] pairs in the desired order
      const orderedEntries: [string, unknown][] = [];
      for (const code of orderedStatusCodes) {
        if (oldResponses[code] !== undefined) {
          orderedEntries.push([code, oldResponses[code]]);
        }
      }
      // Add any keys not in orderedStatusCodes (safety)
      for (const key of Object.keys(oldResponses)) {
        if (!orderedStatusCodes.includes(key)) {
          orderedEntries.push([key, oldResponses[key]]);
        }
      }

      // Find the "responses" block in the raw JSON string and replace it
      // We need to locate the exact "responses": { ... } block for this operation
      // Strategy: find the path+method operation, then find its "responses" key

      // Detect single indent unit from the file (e.g. 2 spaces, 4 spaces, tab)
      const indentMatch = jsonContent.match(/\n(\s+)"/);
      const singleIndent = indentMatch ? indentMatch[1] : '  ';

      // The responses object is at depth 4 in OpenAPI:
      // paths (1) → /path (2) → method (3) → responses (4)
      // Keys inside responses are at depth 5
      const responsesStr = this.buildOrderedJsonObject(orderedEntries, singleIndent, 5);

      // Now we need to find and replace the responses block in the raw string.
      // Use a targeted approach: locate the operation's responses block.
      const result = this.replaceResponsesBlock(jsonContent, endpointPath, method, responsesStr);
      return result;
    } catch (e) {
      this.outputChannel.appendLine(`[reorderResponseKeysInJson] Error: ${e}`);
      return null;
    }
  }

  /**
   * Build a JSON object string with keys in the given order.
   */
  private buildOrderedJsonObject(
    entries: [string, unknown][],
    singleIndent: string,
    depth: number
  ): string {
    if (entries.length === 0) return '{}';

    const currentIndent = singleIndent.repeat(depth);

    const parts = entries.map(([key, value]) => {
      const valStr = JSON.stringify(value, null, singleIndent.length);
      // Re-indent the value string to match the current depth
      const reindented = valStr.split('\n').map((line, i) =>
        i === 0 ? line : currentIndent + line
      ).join('\n');
      return `${currentIndent}${JSON.stringify(key)}: ${reindented}`;
    });

    const closingIndent = singleIndent.repeat(depth - 1);
    return `{\n${parts.join(',\n')}\n${closingIndent}}`;
  }

  /**
   * Find and replace the "responses": { ... } block for a specific operation in raw JSON.
   */
  private replaceResponsesBlock(
    jsonContent: string,
    endpointPath: string,
    method: string,
    newResponsesStr: string
  ): string | null {
    // Find the path key in the JSON
    const pathKey = JSON.stringify(endpointPath);
    let pathIdx = jsonContent.indexOf(pathKey);
    if (pathIdx === -1) return null;

    // Find the method key after the path
    const methodKey = JSON.stringify(method);
    let methodIdx = jsonContent.indexOf(methodKey, pathIdx);
    if (methodIdx === -1) return null;

    // Find "responses" key after the method
    const responsesKey = '"responses"';
    let responsesIdx = jsonContent.indexOf(responsesKey, methodIdx);
    if (responsesIdx === -1) return null;

    // Make sure this "responses" belongs to the current operation
    // (not some other operation's responses further in the file)
    // Check there's no other method key between methodIdx and responsesIdx
    const nextMethodPatterns = ['"get"', '"post"', '"put"', '"delete"', '"patch"', '"options"', '"head"'];
    for (const mp of nextMethodPatterns) {
      if (mp === methodKey) continue;
      const nextMethodIdx = jsonContent.indexOf(mp, methodIdx + methodKey.length);
      if (nextMethodIdx !== -1 && nextMethodIdx < responsesIdx) {
        // This responses key belongs to a different operation
        return null;
      }
    }

    // Find the colon after "responses"
    let colonIdx = jsonContent.indexOf(':', responsesIdx + responsesKey.length);
    if (colonIdx === -1) return null;

    // Find the opening brace of the responses object
    let braceStart = jsonContent.indexOf('{', colonIdx + 1);
    if (braceStart === -1) return null;

    // Find the matching closing brace
    let braceCount = 1;
    let braceEnd = braceStart + 1;
    while (braceEnd < jsonContent.length && braceCount > 0) {
      const ch = jsonContent[braceEnd];
      if (ch === '{') braceCount++;
      else if (ch === '}') braceCount--;
      if (braceCount > 0) braceEnd++;
    }

    if (braceCount !== 0) return null;

    // Replace the responses object
    return jsonContent.substring(0, braceStart) + newResponsesStr + jsonContent.substring(braceEnd + 1);
  }

  async updateResponseSource(
    filePath: string,
    endpointPath: string,
    method: string,
    statusCode: string,
    sourceJson: Record<string, unknown>
  ): Promise<{ success: boolean; message?: string }> {
    return this.withWriteLock(filePath, async () => {
      try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const spec = JSON.parse(content);

        const pathObj = spec.paths?.[endpointPath];
        if (!pathObj) {
          return { success: false, message: `Path ${endpointPath} not found in spec` };
        }

        const operation = pathObj[method.toLowerCase()];
        if (!operation) {
          return { success: false, message: `Method ${method} not found for path ${endpointPath}` };
        }

        if (!operation.responses) {
          operation.responses = {};
        }

        // Validate that sourceJson has required fields
        if (!sourceJson.description && typeof sourceJson.description !== 'string') {
          sourceJson.description = `Response for status ${statusCode}`;
        }

        // Replace the entire response object
        operation.responses[statusCode] = sourceJson;

        const updatedContent = JSON.stringify(spec, null, 2);
        await fs.promises.writeFile(filePath, updatedContent, { encoding: 'utf-8', flag: 'w' });

        this.removeFromCache(filePath);

        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.outputChannel.appendLine(`Error updating response source: ${message}`);
        return { success: false, message };
      }
    });
  }

  dispose(): void {
    this.outputChannel.dispose();
  }
}
