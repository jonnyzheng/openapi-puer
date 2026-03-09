import * as assert from 'assert';
import { Environment } from '../models/types';
import { collectPanelEnvironmentState } from '../extension';

type EnvironmentStateReader = {
  reloadEnvironmentsFromDisk: () => void;
  getEnvironments: () => Environment[];
  getActiveEnvironment: () => Environment | undefined;
  getActiveEnvironmentId: () => string | undefined;
};

function createEnvironment(baseUrl: string): Environment {
  const now = new Date().toISOString();
  return {
    id: 'env_default',
    name: 'Default',
    baseUrl,
    description: '',
    variables: [],
    createdAt: now,
    updatedAt: now
  };
}

suite('Extension Environment Sync Test Suite', () => {
  test('collectPanelEnvironmentState reloads from disk by default', () => {
    let environments = [createEnvironment('https://memory.example.com')];
    let reloadCallCount = 0;

    const service: EnvironmentStateReader = {
      reloadEnvironmentsFromDisk: () => {
        reloadCallCount += 1;
        environments = [createEnvironment('https://disk.example.com')];
      },
      getEnvironments: () => environments,
      getActiveEnvironment: () => environments[0],
      getActiveEnvironmentId: () => environments[0]?.id
    };

    const state = collectPanelEnvironmentState(service);

    assert.strictEqual(reloadCallCount, 1);
    assert.strictEqual(state.activeEnvironmentBaseUrl, 'https://disk.example.com');
  });

  test('collectPanelEnvironmentState keeps in-memory Base URL when reload is disabled', () => {
    let environments = [createEnvironment('https://memory.example.com')];
    let reloadCallCount = 0;

    const service: EnvironmentStateReader = {
      reloadEnvironmentsFromDisk: () => {
        reloadCallCount += 1;
        environments = [createEnvironment('https://disk.example.com')];
      },
      getEnvironments: () => environments,
      getActiveEnvironment: () => environments[0],
      getActiveEnvironmentId: () => environments[0]?.id
    };

    const state = collectPanelEnvironmentState(service, { reloadFromDisk: false });

    assert.strictEqual(reloadCallCount, 0);
    assert.strictEqual(state.activeEnvironmentBaseUrl, 'https://memory.example.com');
  });
});
