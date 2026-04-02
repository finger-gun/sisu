import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  installCapabilityPackage,
  listInstalledCapabilities,
  runInstallRecipe,
} from '../src/chat/capability-install.js';

vi.mock('../src/chat/discovery-package.js', () => ({
  loadDiscoveryRecipes: () => ({
    schemaVersion: 1,
    generatedAt: 'now',
    recipes: [
      {
        id: 'rag-recommended',
        label: 'RAG (Recommended)',
        description: 'Install recommended stack.',
        kind: 'bundle',
        category: 'middleware',
        installs: [
          { type: 'tool', name: '@sisu-ai/tool-rag' },
          { type: 'middleware', name: '@sisu-ai/mw-rag' },
          { type: 'package', name: '@sisu-ai/vector-vectra' },
        ],
        postInstall: [
          { kind: 'enableCapability', id: 'tool-rag', type: 'tool' },
          { kind: 'enableCapability', id: 'rag', type: 'middleware' },
          { kind: 'setConfig', scope: 'tool', id: 'tool-rag', config: { backend: 'vectra' } },
        ],
      },
      {
        id: 'rag-advanced',
        label: 'RAG (Advanced)',
        description: 'Install advanced stack.',
        kind: 'bundle',
        category: 'middleware',
        installs: [
          { type: 'tool', name: '@sisu-ai/tool-rag' },
          { type: 'middleware', name: '@sisu-ai/mw-rag' },
        ],
        choices: [{
          id: 'vector-backend',
          label: 'Vector backend',
          allowCustomPackage: true,
          options: [
            { id: 'vectra', label: 'Vectra', packageName: '@sisu-ai/vector-vectra' },
            { id: 'chroma', label: 'Chroma', packageName: '@sisu-ai/vector-chroma' },
            { id: 'custom', label: 'Custom' },
          ],
        }],
        postInstall: [
          { kind: 'enableCapability', id: 'tool-rag', type: 'tool' },
          { kind: 'enableCapability', id: 'rag', type: 'middleware' },
        ],
      },
    ],
  }),
}));

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('capability install', () => {
  test('installs tool package and persists manifest entry', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-cap-install-tool-'));
    tempDirs.push(root);
    const runInstall = async (installDir: string) => {
      await fs.mkdir(path.join(installDir, 'node_modules', '@sisu-ai', 'tool-azure-blob'), { recursive: true });
    };

    const result = await installCapabilityPackage(
      {
        type: 'tool',
        name: 'azure-blob',
        scope: 'project',
        cwd: root,
        homeDir: root,
      },
      { runInstall },
    );

    expect(result.record.id).toBe('tool-azure-blob');
    expect(result.record.packageName).toBe('@sisu-ai/tool-azure-blob');
    const listed = await listInstalledCapabilities({ cwd: root, homeDir: root });
    expect(listed.some((entry) => entry.id === 'tool-azure-blob' && entry.type === 'tool')).toBe(true);
  });

  test('installs middleware package and normalizes capability id', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-cap-install-mw-'));
    tempDirs.push(root);
    const runInstall = async (installDir: string) => {
      await fs.mkdir(path.join(installDir, 'node_modules', '@sisu-ai', 'mw-context-compressor'), { recursive: true });
    };

    const result = await installCapabilityPackage(
      {
        type: 'middleware',
        name: 'mw-context-compressor',
        scope: 'project',
        cwd: root,
        homeDir: root,
      },
      { runInstall },
    );

    expect(result.record.id).toBe('context-compressor');
    expect(result.record.packageName).toBe('@sisu-ai/mw-context-compressor');
  });

  test('rejects empty capability names', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-cap-install-invalid-'));
    tempDirs.push(root);
    await expect(installCapabilityPackage({
      type: 'tool',
      name: '   ',
      scope: 'project',
      cwd: root,
      homeDir: root,
    })).rejects.toThrow('E6610');
  });

  test('rejects invalid name characters', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-cap-install-invalid-chars-'));
    tempDirs.push(root);
    await expect(installCapabilityPackage({
      type: 'middleware',
      name: 'bad/name',
      scope: 'project',
      cwd: root,
      homeDir: root,
    })).rejects.toThrow('E6614');
  });

  test('rolls back install dir when manifest write fails', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-cap-install-rollback-'));
    tempDirs.push(root);
    const runInstall = async (installDir: string) => {
      await fs.mkdir(path.join(installDir, 'node_modules', '@sisu-ai', 'tool-rag'), { recursive: true });
    };
    await expect(installCapabilityPackage(
      {
        type: 'tool',
        name: 'rag',
        scope: 'project',
        cwd: root,
        homeDir: root,
      },
      {
        runInstall,
        writeManifest: async () => {
          throw new Error('write failed');
        },
      },
    )).rejects.toThrow('E6612');

    const installDir = path.join(root, '.sisu', 'capabilities', 'tools', 'rag');
    await expect(fs.access(installDir)).rejects.toBeTruthy();
  });

  test('runInstallRecipe completes rag-recommended with ordered install steps', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-cap-install-recipe-ok-'));
    tempDirs.push(root);
    const calls: string[] = [];
    const runInstall = async (_installDir: string, packageName: string) => {
      calls.push(packageName);
    };

    const result = await runInstallRecipe(
      {
        recipeId: 'rag-recommended',
        scope: 'project',
        cwd: root,
        homeDir: root,
      },
      { runInstall },
    );

    expect(result.status).toBe('completed');
    expect(calls).toEqual([
      '@sisu-ai/tool-rag',
      '@sisu-ai/mw-rag',
      '@sisu-ai/vector-vectra',
    ]);
    expect(result.completedSteps.some((step) => step.kind === 'set-tool-config')).toBe(true);
  });

  test('runInstallRecipe stops on install failure and reports failed step', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-cap-install-recipe-fail-'));
    tempDirs.push(root);
    const runInstall = async (_installDir: string, packageName: string) => {
      if (packageName === '@sisu-ai/mw-rag') {
        throw new Error('install failed');
      }
    };

    const result = await runInstallRecipe(
      {
        recipeId: 'rag-recommended',
        scope: 'project',
        cwd: root,
        homeDir: root,
      },
      { runInstall },
    );
    expect(result.status).toBe('failed');
    expect(result.failedStep).toContain('@sisu-ai/mw-rag');
    expect(result.completedSteps.filter((step) => step.kind === 'install').length).toBe(1);
  });

  test('runInstallRecipe supports cancellation before execution and during run', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-cap-install-recipe-cancel-'));
    tempDirs.push(root);
    const cancelledBefore = await runInstallRecipe(
      {
        recipeId: 'rag-recommended',
        scope: 'project',
        cwd: root,
        homeDir: root,
      },
      { shouldCancel: () => true },
    );
    expect(cancelledBefore.status).toBe('cancelled');
    expect(cancelledBefore.completedSteps).toEqual([]);

    let callCount = 0;
    const cancelledDuring = await runInstallRecipe(
      {
        recipeId: 'rag-recommended',
        scope: 'project',
        cwd: root,
        homeDir: root,
      },
      {
        runInstall: async () => {
          callCount += 1;
        },
        shouldCancel: () => callCount > 0,
      },
    );
    expect(cancelledDuring.status).toBe('cancelled');
    expect(cancelledDuring.completedSteps.length).toBe(1);
  });

  test('runInstallRecipe rag-advanced applies backend choice and custom package', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-cap-install-recipe-advanced-'));
    tempDirs.push(root);
    const calls: string[] = [];
    const runInstall = async (_installDir: string, packageName: string) => {
      calls.push(packageName);
    };
    const result = await runInstallRecipe(
      {
        recipeId: 'rag-advanced',
        scope: 'project',
        cwd: root,
        homeDir: root,
      },
      {
        runInstall,
        resolveChoice: async () => ({
          optionId: 'custom',
          customPackageName: '@sisu-ai/vector-custom',
        }),
      },
    );
    expect(result.status).toBe('completed');
    expect(calls).toEqual([
      '@sisu-ai/tool-rag',
      '@sisu-ai/mw-rag',
      '@sisu-ai/vector-custom',
    ]);
    expect(result.completedSteps.some((step) => step.kind === 'set-middleware-config')).toBe(true);
  });
});
