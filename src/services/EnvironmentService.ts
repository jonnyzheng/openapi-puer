import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Environment, EnvironmentVariable } from '../models/types';

type EnvironmentFileShape = Environment[] | { environments?: Environment[] };

export class EnvironmentService {
  private environments: Environment[] = [];
  private activeEnvironmentId: string | undefined;
  private workspaceState: vscode.Memento;
  private secretStorage: vscode.SecretStorage;
  private workspaceRoot: string | undefined;
  private apiDirectory: string | undefined;

  private onEnvironmentsChangeEmitter = new vscode.EventEmitter<void>();
  readonly onEnvironmentsChange = this.onEnvironmentsChangeEmitter.event;

  constructor(context: vscode.ExtensionContext) {
    this.workspaceState = context.workspaceState;
    this.secretStorage = context.secrets;
    this.workspaceRoot = this.resolveWorkspaceRoot();

    this.loadEnvironments();
    this.activeEnvironmentId = this.workspaceState.get('activeEnvironmentId');
  }

  private resolveWorkspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private resolveBaseDirectory(): string | undefined {
    if (this.apiDirectory) return this.apiDirectory;
    return this.resolveWorkspaceRoot();
  }

  setApiDirectory(apiDirectory: string | undefined): void {
    this.apiDirectory = apiDirectory;
    this.loadEnvironments();
  }

  private getEnvironmentsFilePath(): string | undefined {
    const baseDir = this.resolveBaseDirectory();
    if (!baseDir) return undefined;
    return path.join(baseDir, '.openapi-puer', 'environments.json');
  }

  private ensureDirectoryExists(): void {
    const baseDir = this.resolveBaseDirectory();
    if (!baseDir) return;
    const dir = path.join(baseDir, '.openapi-puer');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private loadEnvironments(): void {
    const filePath = this.getEnvironmentsFilePath();
    if (!filePath || !fs.existsSync(filePath)) {
      this.environments = [];
      return;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content) as EnvironmentFileShape;
      const environments = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.environments)
          ? parsed.environments
          : [];
      this.environments = environments.map((env) => this.normalizeEnvironment(env));
    } catch (error) {
      console.error('Failed to load environments:', error);
      this.environments = [];
    }
  }

  private saveEnvironments(): void {
    const filePath = this.getEnvironmentsFilePath();
    if (!filePath) return;

    this.ensureDirectoryExists();

    // Filter out secret values before saving
    const environmentsToSave = this.environments.map((env) => ({
      ...env,
      baseUrl: env.baseUrl ?? '',
      description: env.description ?? '',
      variables: env.variables.map((v) => ({
        ...v,
        type: this.normalizeVariableType(v.type),
        value: v.isSecret ? '' : v.value
      }))
    }));

    fs.writeFileSync(filePath, JSON.stringify({ environments: environmentsToSave }, null, 2));
    this.onEnvironmentsChangeEmitter.fire();
  }

  getEnvironments(): Environment[] {
    return this.environments;
  }

  reloadEnvironmentsFromDisk(): void {
    this.loadEnvironments();
  }

  async setEnvironments(
    environments: Environment[],
    options: { persist?: boolean } = {}
  ): Promise<void> {
    const previousSecretKeys = new Set<string>();
    for (const environment of this.environments) {
      for (const variable of environment.variables) {
        if (variable.isSecret) {
          previousSecretKeys.add(`${environment.id}:${variable.key}`);
        }
      }
    }

    const normalized = environments.map((environment) => this.normalizeEnvironment(environment));
    const nextSecretKeys = new Set<string>();

    for (const environment of normalized) {
      for (const variable of environment.variables) {
        if (!variable.isSecret) {
          continue;
        }

        const secretKey = `${environment.id}:${variable.key}`;
        nextSecretKeys.add(secretKey);

        if (variable.value) {
          await this.setSecretValue(environment.id, variable.key, variable.value);
        }
        variable.value = '';
      }
    }

    for (const secretKey of previousSecretKeys) {
      if (nextSecretKeys.has(secretKey)) {
        continue;
      }
      const [environmentId, variableKey] = secretKey.split(':');
      await this.deleteSecretValue(environmentId, variableKey);
    }

    this.environments = normalized;

    if (this.activeEnvironmentId && !this.environments.some((environment) => environment.id === this.activeEnvironmentId)) {
      this.activeEnvironmentId = undefined;
      await this.workspaceState.update('activeEnvironmentId', undefined);
    }

    if (options.persist === false) {
      this.onEnvironmentsChangeEmitter.fire();
      return;
    }

    this.saveEnvironments();
  }

  getEnvironment(id: string): Environment | undefined {
    return this.environments.find(e => e.id === id);
  }

  getActiveEnvironment(): Environment | undefined {
    if (!this.activeEnvironmentId) return undefined;
    return this.getEnvironment(this.activeEnvironmentId);
  }

  getActiveEnvironmentId(): string | undefined {
    return this.activeEnvironmentId;
  }

  async setActiveEnvironment(id: string | undefined): Promise<void> {
    this.activeEnvironmentId = id;
    await this.workspaceState.update('activeEnvironmentId', id);
    this.onEnvironmentsChangeEmitter.fire();
  }

  async createEnvironment(name: string): Promise<Environment> {
    const id = this.generateId();
    const now = new Date().toISOString();

    const environment: Environment = {
      id,
      name,
      baseUrl: '',
      description: '',
      variables: [],
      createdAt: now,
      updatedAt: now
    };

    this.environments.push(environment);
    this.saveEnvironments();

    return environment;
  }

  async duplicateEnvironment(id: string, newName: string): Promise<Environment | undefined> {
    const source = this.getEnvironment(id);
    if (!source) return undefined;

    const newId = this.generateId();
    const now = new Date().toISOString();

    const environment: Environment = {
      id: newId,
      name: newName,
      baseUrl: source.baseUrl ?? '',
      description: source.description ?? '',
      variables: source.variables.map((v) => ({
        ...v,
        type: this.normalizeVariableType(v.type)
      })),
      createdAt: now,
      updatedAt: now
    };

    // Copy secret values
    for (const variable of environment.variables) {
      if (variable.isSecret) {
        const secretValue = await this.getSecretValue(id, variable.key);
        if (secretValue) {
          await this.setSecretValue(newId, variable.key, secretValue);
        }
      }
    }

    this.environments.push(environment);
    this.saveEnvironments();

    return environment;
  }

  async updateEnvironment(
    id: string,
    updates: Partial<Pick<Environment, 'name' | 'baseUrl' | 'description' | 'variables'>>
  ): Promise<void> {
    const environment = this.getEnvironment(id);
    if (!environment) return;

    if (updates.name !== undefined) {
      environment.name = updates.name;
    }

    if (updates.baseUrl !== undefined) {
      environment.baseUrl = updates.baseUrl;
    }

    if (updates.description !== undefined) {
      environment.description = updates.description;
    }

    if (updates.variables !== undefined) {
      environment.variables = updates.variables.map((v) => this.normalizeVariable(v));
    }

    environment.updatedAt = new Date().toISOString();
    this.saveEnvironments();
  }

  async deleteEnvironment(id: string): Promise<void> {
    const index = this.environments.findIndex(e => e.id === id);
    if (index === -1) return;

    // Clear secrets for this environment
    const environment = this.environments[index];
    for (const variable of environment.variables) {
      if (variable.isSecret) {
        await this.deleteSecretValue(id, variable.key);
      }
    }

    this.environments.splice(index, 1);

    if (this.activeEnvironmentId === id) {
      await this.setActiveEnvironment(undefined);
    }

    this.saveEnvironments();
  }

  async addVariable(environmentId: string, variable: EnvironmentVariable): Promise<void> {
    const environment = this.getEnvironment(environmentId);
    if (!environment) return;

    const normalizedVariable = this.normalizeVariable(variable);

    // Store secret value separately
    if (normalizedVariable.isSecret && normalizedVariable.value) {
      await this.setSecretValue(environmentId, normalizedVariable.key, normalizedVariable.value);
      normalizedVariable.value = '';
    }

    environment.variables.push(normalizedVariable);
    environment.updatedAt = new Date().toISOString();
    this.saveEnvironments();
  }

  async updateVariable(
    environmentId: string,
    key: string,
    updates: Partial<EnvironmentVariable>
  ): Promise<void> {
    const environment = this.getEnvironment(environmentId);
    if (!environment) return;

    const variable = environment.variables.find(v => v.key === key);
    if (!variable) return;

    const nextType = updates.type !== undefined
      ? this.normalizeVariableType(updates.type)
      : this.normalizeVariableType(variable.type);
    const nextIsSecret = updates.isSecret !== undefined
      ? updates.isSecret
      : (variable.isSecret ?? false);
    const shouldBeSecret = Boolean(nextIsSecret) || nextType === 'secret';
    const targetKey = updates.key || key;

    // Handle secret value updates
    if (updates.value !== undefined) {
      if (shouldBeSecret) {
        await this.setSecretValue(environmentId, targetKey, updates.value);
        updates.value = '';
      } else if (variable.isSecret) {
        await this.deleteSecretValue(environmentId, key);
      }
    } else if (shouldBeSecret) {
      const existingValue = variable.isSecret
        ? await this.getSecretValue(environmentId, key)
        : variable.value;
      if (existingValue) {
        await this.setSecretValue(environmentId, targetKey, existingValue);
      }
      updates.value = '';
    } else if (variable.isSecret) {
      const existingSecret = await this.getSecretValue(environmentId, key);
      if (existingSecret !== undefined) {
        updates.value = existingSecret;
      }
      await this.deleteSecretValue(environmentId, key);
    }

    // Handle key rename for secrets
    if (updates.key && updates.key !== key && variable.isSecret) {
      const secretValue = await this.getSecretValue(environmentId, key);
      if (secretValue && shouldBeSecret) {
        await this.setSecretValue(environmentId, updates.key, secretValue);
      }
      if (secretValue || !shouldBeSecret) {
        await this.deleteSecretValue(environmentId, key);
      }
    }

    updates.type = nextType;
    updates.isSecret = shouldBeSecret;

    Object.assign(variable, updates);
    environment.updatedAt = new Date().toISOString();
    this.saveEnvironments();
  }

  async deleteVariable(environmentId: string, key: string): Promise<void> {
    const environment = this.getEnvironment(environmentId);
    if (!environment) return;

    const index = environment.variables.findIndex(v => v.key === key);
    if (index === -1) return;

    const variable = environment.variables[index];
    if (variable.isSecret) {
      await this.deleteSecretValue(environmentId, key);
    }

    environment.variables.splice(index, 1);
    environment.updatedAt = new Date().toISOString();
    this.saveEnvironments();
  }

  async getVariablesAsRecord(environmentId?: string): Promise<Record<string, string>> {
    const id = environmentId || this.activeEnvironmentId;
    if (!id) return {};

    const environment = this.getEnvironment(id);
    if (!environment) return {};

    const variables: Record<string, string> = {};

    for (const variable of environment.variables) {
      if (variable.isSecret) {
        const secretValue = await this.getSecretValue(id, variable.key);
        variables[variable.key] = secretValue !== undefined ? secretValue : variable.value;
      } else {
        variables[variable.key] = variable.value;
      }
    }

    variables.baseUrl = environment.baseUrl ?? '';

    return variables;
  }

  async exportEnvironment(id: string): Promise<string | undefined> {
    const environment = this.getEnvironment(id);
    if (!environment) return undefined;

    // Export without secret values
    const exportData = {
      name: environment.name,
      baseUrl: environment.baseUrl ?? '',
      description: environment.description ?? '',
      variables: environment.variables.map(v => ({
        key: v.key,
        value: v.isSecret ? '' : v.value,
        description: v.description,
        isSecret: v.isSecret,
        type: this.normalizeVariableType(v.type)
      }))
    };

    return JSON.stringify(exportData, null, 2);
  }

  async importEnvironment(jsonContent: string): Promise<Environment | undefined> {
    try {
      const data = JSON.parse(jsonContent);

      if (!data.name || !Array.isArray(data.variables)) {
        throw new Error('Invalid environment format');
      }

      const environment = await this.createEnvironment(data.name);
      await this.updateEnvironment(environment.id, {
        baseUrl: typeof data.baseUrl === 'string' ? data.baseUrl : '',
        description: typeof data.description === 'string' ? data.description : ''
      });

      for (const variable of data.variables) {
        await this.addVariable(environment.id, {
          key: variable.key,
          value: variable.value || '',
          description: variable.description,
          isSecret: variable.isSecret,
          type: this.normalizeVariableType(variable.type)
        });
      }

      return environment;
    } catch (error) {
      console.error('Failed to import environment:', error);
      return undefined;
    }
  }

  private async getSecretValue(environmentId: string, key: string): Promise<string | undefined> {
    const secretKey = `openapi-puer.env.${environmentId}.${key}`;
    return this.secretStorage.get(secretKey);
  }

  private async setSecretValue(environmentId: string, key: string, value: string): Promise<void> {
    const secretKey = `openapi-puer.env.${environmentId}.${key}`;
    await this.secretStorage.store(secretKey, value);
  }

  private async deleteSecretValue(environmentId: string, key: string): Promise<void> {
    const secretKey = `openapi-puer.env.${environmentId}.${key}`;
    await this.secretStorage.delete(secretKey);
  }

  private generateId(): string {
    return `env_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private normalizeVariableType(type: unknown): EnvironmentVariable['type'] {
    return type === 'secret' || type === 'url' || type === 'text' ? type : 'text';
  }

  private normalizeVariable(variable: Partial<EnvironmentVariable> | EnvironmentVariable): EnvironmentVariable {
    return {
      key: typeof variable.key === 'string' ? variable.key : '',
      value: typeof variable.value === 'string' ? variable.value : '',
      description: typeof variable.description === 'string' ? variable.description : undefined,
      isSecret: Boolean(variable.isSecret),
      type: this.normalizeVariableType(variable.type)
    };
  }

  private normalizeEnvironment(environment: Partial<Environment> | Environment): Environment {
    const now = new Date().toISOString();
    const rawVariables = Array.isArray(environment.variables) ? environment.variables : [];
    return {
      id: typeof environment.id === 'string' ? environment.id : this.generateId(),
      name: typeof environment.name === 'string' ? environment.name : 'Environment',
      baseUrl: typeof environment.baseUrl === 'string' ? environment.baseUrl : '',
      description: typeof environment.description === 'string' ? environment.description : '',
      variables: rawVariables.map((v) => this.normalizeVariable(v)),
      createdAt: typeof environment.createdAt === 'string' ? environment.createdAt : now,
      updatedAt: typeof environment.updatedAt === 'string' ? environment.updatedAt : now
    };
  }

  dispose(): void {
    this.onEnvironmentsChangeEmitter.dispose();
  }
}
