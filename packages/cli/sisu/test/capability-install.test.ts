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
      {
        id: 'bad-step',
        label: 'Bad step',
        description: 'Contains mismatched install step.',
        kind: 'bundle',
        category: 'middleware',
        installs: [
          { type: 'tool', name: 'left-pad' },
        ],
        postInstall: [],
      },
      {
        id: 'bad-postinstall',
        label: 'Bad post-install',
        description: 'Contains unsupported post-install action.',
        kind: 'bundle',
        category: 'middleware',
        installs: [],
        postInstall: [
          { kind: 'enableCapability', id: 'oops', type: 'package' as unknown as 'tool' },
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

  test('runInstallRecipe rejects unknown recipe id', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-cap-install-recipe-unknown-'));
    tempDirs.push(root);
    await expect(runInstallRecipe({
      recipeId: 'missing-recipe',
      scope: 'project',
      cwd: root,
      homeDir: root,
    })).rejects.toThrow('E6620');
  });

  test('runInstallRecipe rag-advanced defaults to vectra backend without resolver', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-cap-install-recipe-advanced-default-'));
    tempDirs.push(root);
    const calls: string[] = [];
    const result = await runInstallRecipe(
      {
        recipeId: 'rag-advanced',
        scope: 'project',
        cwd: root,
        homeDir: root,
      },
      {
        runInstall: async (_installDir: string, packageName: string) => {
          calls.push(packageName);
        },
      },
    );
    expect(result.status).toBe('completed');
    expect(calls).toContain('@sisu-ai/vector-vectra');
    expect(result.completedSteps.some((step) => step.kind === 'set-tool-config' && step.config.backend === 'vectra')).toBe(true);
  });

  test('runInstallRecipe rag-advanced can be cancelled by resolver', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-cap-install-recipe-advanced-cancel-choice-'));
    tempDirs.push(root);
    const result = await runInstallRecipe(
      {
        recipeId: 'rag-advanced',
        scope: 'project',
        cwd: root,
        homeDir: root,
      },
      {
        resolveChoice: async () => undefined,
      },
    );
    expect(result.status).toBe('cancelled');
  });

  test('runInstallRecipe rag-advanced validates custom and unknown backend choices', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-cap-install-recipe-advanced-choice-errors-'));
    tempDirs.push(root);

    await expect(runInstallRecipe(
      {
        recipeId: 'rag-advanced',
        scope: 'project',
        cwd: root,
        homeDir: root,
      },
      {
        resolveChoice: async () => ({ optionId: 'custom' }),
      },
    )).rejects.toThrow('E6621');

    await expect(runInstallRecipe(
      {
        recipeId: 'rag-advanced',
        scope: 'project',
        cwd: root,
        homeDir: root,
      },
      {
        resolveChoice: async () => ({ optionId: 'not-real' }),
      },
    )).rejects.toThrow('E6622');
  });

  test('runInstallRecipe rag-advanced maps chroma backend', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-cap-install-recipe-advanced-chroma-'));
    tempDirs.push(root);
    const result = await runInstallRecipe(
      {
        recipeId: 'rag-advanced',
        scope: 'project',
        cwd: root,
        homeDir: root,
      },
      {
        runInstall: async () => {},
        resolveChoice: async () => ({ optionId: 'chroma' }),
      },
    );
    expect(result.status).toBe('completed');
    expect(result.completedSteps.some((step) => step.kind === 'set-tool-config' && step.config.backend === 'chroma')).toBe(true);
  });

  test('runInstallRecipe can cancel during post-install phase', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-cap-install-recipe-cancel-postinstall-'));
    tempDirs.push(root);
    let installCount = 0;
    const result = await runInstallRecipe(
      {
        recipeId: 'rag-recommended',
        scope: 'project',
        cwd: root,
        homeDir: root,
      },
      {
        runInstall: async () => {
          installCount += 1;
        },
        shouldCancel: () => installCount >= 3,
      },
    );
    expect(result.status).toBe('cancelled');
    expect(result.completedSteps.filter((step) => step.kind === 'install').length).toBe(3);
  });

  test('runInstallRecipe surfaces invalid recipe install and post-install shapes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-cap-install-recipe-invalid-shape-'));
    tempDirs.push(root);

    const badInstall = await runInstallRecipe(
      {
        recipeId: 'bad-step',
        scope: 'project',
        cwd: root,
        homeDir: root,
      },
      {
        runInstall: async () => {},
      },
    );
    expect(badInstall.status).toBe('failed');
    expect(badInstall.error).toContain('E6623');

    await expect(runInstallRecipe(
      {
        recipeId: 'bad-postinstall',
        scope: 'project',
        cwd: root,
        homeDir: root,
      },
      {
        runInstall: async () => {},
      },
    )).rejects.toThrow('E6624');
  });

  test('listInstalledCapabilities ignores invalid manifest schema', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-cap-install-invalid-manifest-'));
    tempDirs.push(root);
    const cwd = path.join(root, 'repo');
    const homeDir = path.join(root, 'home');
    const projectManifest = path.join(cwd, '.sisu', 'capabilities', 'manifest.json');
    const globalManifest = path.join(homeDir, '.sisu', 'capabilities', 'manifest.json');
    await fs.mkdir(path.dirname(projectManifest), { recursive: true });
    await fs.mkdir(path.dirname(globalManifest), { recursive: true });
    await fs.writeFile(projectManifest, JSON.stringify({ version: 2, entries: {} }), 'utf8');
    await fs.writeFile(globalManifest, JSON.stringify({ version: 0, entries: null }), 'utf8');

    const listed = await listInstalledCapabilities({ cwd, homeDir });
    expect(listed).toEqual([]);
  });
});
