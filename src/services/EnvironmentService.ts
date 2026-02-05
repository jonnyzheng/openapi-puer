import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Environment, EnvironmentVariable } from '../models/types';

export class EnvironmentService {
  private environments: Environment[] = [];
  private activeEnvironmentId: string | undefined;
  private workspaceState: vscode.Memento;
  private secretStorage: vscode.SecretStorage;
  private workspaceRoot: string | undefined;

  private onEnvironmentsChangeEmitter = new vscode.EventEmitter<void>();
  readonly onEnvironmentsChange = this.onEnvironmentsChangeEmitter.event;

  constructor(context: vscode.ExtensionContext) {
    this.workspaceState = context.workspaceState;
    this.secretStorage = context.secrets;
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    this.loadEnvironments();
    this.activeEnvironmentId = this.workspaceState.get('activeEnvironmentId');
  }

  private getEnvironmentsFilePath(): string | undefined {
    if (!this.workspaceRoot) return undefined;
    return path.join(this.workspaceRoot, '.superapi', 'environments.json');
  }

  private ensureDirectoryExists(): void {
    if (!this.workspaceRoot) return;
    const dir = path.join(this.workspaceRoot, '.superapi');
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
      this.environments = JSON.parse(content);
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
    const environmentsToSave = this.environments.map(env => ({
      ...env,
      variables: env.variables.map(v => ({
        ...v,
        value: v.isSecret ? '' : v.value
      }))
    }));

    fs.writeFileSync(filePath, JSON.stringify(environmentsToSave, null, 2));
    this.onEnvironmentsChangeEmitter.fire();
  }

  getEnvironments(): Environment[] {
    return this.environments;
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
      variables: source.variables.map(v => ({ ...v })),
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

  async updateEnvironment(id: string, updates: Partial<Pick<Environment, 'name' | 'variables'>>): Promise<void> {
    const environment = this.getEnvironment(id);
    if (!environment) return;

    if (updates.name !== undefined) {
      environment.name = updates.name;
    }

    if (updates.variables !== undefined) {
      environment.variables = updates.variables;
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

    // Store secret value separately
    if (variable.isSecret && variable.value) {
      await this.setSecretValue(environmentId, variable.key, variable.value);
      variable.value = '';
    }

    environment.variables.push(variable);
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

    // Handle secret value updates
    if (updates.value !== undefined) {
      if (variable.isSecret || updates.isSecret) {
        await this.setSecretValue(environmentId, updates.key || key, updates.value);
        updates.value = '';
      }
    }

    // Handle key rename for secrets
    if (updates.key && updates.key !== key && variable.isSecret) {
      const secretValue = await this.getSecretValue(environmentId, key);
      if (secretValue) {
        await this.setSecretValue(environmentId, updates.key, secretValue);
        await this.deleteSecretValue(environmentId, key);
      }
    }

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
        variables[variable.key] = secretValue || '';
      } else {
        variables[variable.key] = variable.value;
      }
    }

    return variables;
  }

  async exportEnvironment(id: string): Promise<string | undefined> {
    const environment = this.getEnvironment(id);
    if (!environment) return undefined;

    // Export without secret values
    const exportData = {
      name: environment.name,
      variables: environment.variables.map(v => ({
        key: v.key,
        value: v.isSecret ? '' : v.value,
        description: v.description,
        isSecret: v.isSecret
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

      for (const variable of data.variables) {
        await this.addVariable(environment.id, {
          key: variable.key,
          value: variable.value || '',
          description: variable.description,
          isSecret: variable.isSecret
        });
      }

      return environment;
    } catch (error) {
      console.error('Failed to import environment:', error);
      return undefined;
    }
  }

  private async getSecretValue(environmentId: string, key: string): Promise<string | undefined> {
    const secretKey = `superapi.env.${environmentId}.${key}`;
    return this.secretStorage.get(secretKey);
  }

  private async setSecretValue(environmentId: string, key: string, value: string): Promise<void> {
    const secretKey = `superapi.env.${environmentId}.${key}`;
    await this.secretStorage.store(secretKey, value);
  }

  private async deleteSecretValue(environmentId: string, key: string): Promise<void> {
    const secretKey = `superapi.env.${environmentId}.${key}`;
    await this.secretStorage.delete(secretKey);
  }

  private generateId(): string {
    return `env_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  dispose(): void {
    this.onEnvironmentsChangeEmitter.dispose();
  }
}
