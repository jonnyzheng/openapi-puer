export type OpenApiVersionFamily = '3.0' | '3.1' | '3.2';

export const DEFAULT_OPENAPI_VERSION = '3.1.1';

export const OPENAPI_DROPDOWN_VERSIONS: ReadonlyArray<string> = [
  '3.0.3',
  '3.1.1',
  '3.2.0'
];

const SUPPORTED_OPENAPI_VERSION_PATTERN = /^3\.(0|1|2)\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function isSupportedOpenApiVersion(value: unknown): value is string {
  return typeof value === 'string' && SUPPORTED_OPENAPI_VERSION_PATTERN.test(value.trim());
}

export function getOpenApiVersionFamily(version: string): OpenApiVersionFamily | null {
  const trimmed = version.trim();
  if (!isSupportedOpenApiVersion(trimmed)) {
    return null;
  }

  if (trimmed.startsWith('3.0.')) {
    return '3.0';
  }

  if (trimmed.startsWith('3.1.')) {
    return '3.1';
  }

  if (trimmed.startsWith('3.2.')) {
    return '3.2';
  }

  return null;
}

export function getOpenApiVersionValidationError(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return 'api.json must define openapi using a supported version (3.0.x, 3.1.x, or 3.2.x).';
  }

  if (!isSupportedOpenApiVersion(value)) {
    return `Unsupported OpenAPI version "${value}". Supported versions are 3.0.x, 3.1.x, and 3.2.x.`;
  }

  return null;
}
