import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  ChatRuntime,
  getMiddlewareConfigDescriptor,
  ProfileValidationError,
  filterOfficialPackages,
  getMiddlewareCatalogEntry,
  loadResolvedProfile,
  mergeToolPolicy,
  persistAllowCommandPrefix,
  persistCapabilityOverride,
  validateMiddlewareConfig,
  validateAndNormalizeProfile,
} from '../src/lib.js';

vi.mock('../src/chat/discovery-package.js', () => ({
  loadDiscoveryCatalog: () => ({
    schemaVersion: 1,
    generatedAt: 'now',
    entries: [
      {
        id: 'tool-rag',
        category: 'tools',
        title: '@sisu-ai/tool-rag',
        packageName: '@sisu-ai/tool-rag',
        version: '8.0.0',
        summary: 'RAG tool package',
      },
      {
        id: 'skill-debug',
        category: 'skills',
        title: '@sisu-ai/skill-debug',
        packageName: '@sisu-ai/skill-debug',
        version: '0.2.2',
        summary: 'Debug skill package',
      },
    ],
  }),
}));

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function baseProfile(storageDir: string) {
  return {
    name: 'cap',
    provider: 'mock' as const,
    model: 'sisu-mock-chat-v1',
    theme: 'plain' as const,
    storageDir,
    toolPolicy: mergeToolPolicy(),
  };
}

describe('chat capabilities', () => {
  test('validates conflicting capability entries and unknown ids', () => {
    expect(() => validateAndNormalizeProfile(
      {
        capabilities: {
          tools: {
            enabled: ['terminal', 'unknown-tool'],
            disabled: ['terminal'],
          },
        },
      },
      baseProfile('/tmp/sisu'),
      { knownCapabilityIds: ['terminal'] },
    )).toThrow(ProfileValidationError);
  });

  test('enforces locked middleware constraints in validation', () => {
    expect(() => validateAndNormalizeProfile(
      {
        capabilities: {
          middleware: {
            disabled: ['error-boundary'],
          },
        },
      },
      baseProfile('/tmp/sisu'),
      { knownCapabilityIds: ['error-boundary', 'invariants', 'register-tools', 'tool-calling'] },
    )).toThrow(ProfileValidationError);
  });

  test('expands tilde skill directories in profile normalization', () => {
    const homeDir = '/tmp/home-test';
    const normalized = validateAndNormalizeProfile(
      {
        capabilities: {
          skills: {
            directories: ['~/.sisu/skills', './.sisu/skills'],
          },
        },
      },
      baseProfile('/tmp/project'),
      {
        knownCapabilityIds: ['skills'],
        cwd: '/tmp/project',
        homeDir,
      },
    );
    expect(normalized.capabilities?.skills.directories).toEqual([
      path.join(homeDir, '.sisu', 'skills'),
      path.join('/tmp/project', '.sisu', 'skills'),
    ]);
  });

  test('applies capability toggles and allow-list by scope', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-capabilities-'));
    tempDirs.push(root);

    const runtime = await ChatRuntime.create({
      cwd: root,
      profile: baseProfile(path.join(root, 'sessions')),
    });

    expect(runtime.isCapabilityEnabled('skills')).toBe(true);
    await runtime.setCapabilityEnabled('skills', false, 'session');
    expect(runtime.isCapabilityEnabled('skills')).toBe(false);
    await runtime.setCapabilityEnabled('skills', true, 'session');
    expect(runtime.isCapabilityEnabled('skills')).toBe(true);

    await runtime.addAllowCommandPrefix('echo', 'session');
    expect(runtime.listAllowCommandPrefixes()).toContain('echo');
  });

  test('filters official packages by strict category prefix', () => {
    const filtered = filterOfficialPackages('skills', [
      { name: '@sisu-ai/skill-debug', version: '1.0.0', description: 'ok' },
      { name: '@sisu-ai/tool-terminal', version: '1.0.0', description: 'wrong category' },
      { name: '@other/skill-demo', version: '1.0.0', description: 'wrong namespace' },
    ]);
    expect(filtered).toEqual([
      { name: '@sisu-ai/skill-debug', version: '1.0.0', description: 'ok' },
    ]);
  });

  test('capability listing includes discovery package metadata for catalog capabilities', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-capabilities-discovery-metadata-'));
    tempDirs.push(root);
    const runtime = await ChatRuntime.create({
      cwd: root,
      profile: baseProfile(path.join(root, 'sessions')),
    });
    const tools = runtime.listCapabilities('tool');
    const rag = tools.find((entry) => entry.id === 'tool-rag');
    expect(rag?.packageName).toBe('@sisu-ai/tool-rag');
    expect(typeof rag?.description).toBe('string');
  });

  test('validates middleware option schema hooks', () => {
    expect(getMiddlewareCatalogEntry('skills')).toBeTruthy();
    expect(getMiddlewareConfigDescriptor('tool-calling')?.options.some((option) => option.path === 'maxRounds')).toBe(true);
    expect(validateMiddlewareConfig('tool-calling', { maxRounds: 12 })).toEqual([]);
    expect(validateMiddlewareConfig('tool-calling', { maxRounds: 0 }).join(' ')).toContain('positive integer');
    expect(validateMiddlewareConfig('skills', { directories: ['.sisu/skills'] })).toEqual([]);
    expect(validateMiddlewareConfig('skills', { directories: [123] as unknown as string[] }).join(' ')).toContain('directories');
    expect(validateMiddlewareConfig('conversation-buffer', { maxMessages: 20 })).toEqual([]);
    expect(validateMiddlewareConfig('conversation-buffer', { maxMessages: -1 }).join(' ')).toContain('positive integer');
    expect(validateMiddlewareConfig('trace-viewer', { enable: true, dir: './traces', html: true, style: 'light' })).toEqual([]);
    expect(validateMiddlewareConfig('trace-viewer', { dir: '' }).join(' ')).toContain("Option 'dir' must be a non-empty string.");
    expect(validateMiddlewareConfig('trace-viewer', { style: 'sepia' }).join(' ')).toContain('light, dark');
    expect(validateMiddlewareConfig('rag', { backend: 'vectra' })).toEqual([]);
    expect(validateMiddlewareConfig('rag', { backend: 'wat' }).join(' ')).toContain('backend');
    expect(validateMiddlewareConfig('rag', { vectorPackage: '' }).join(' ')).toContain('vectorPackage');
  });

  test('runtime fails startup for invalid middleware config', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-capabilities-invalid-mw-'));
    tempDirs.push(root);
    await expect(ChatRuntime.create({
      cwd: root,
      profile: {
        ...baseProfile(path.join(root, 'sessions')),
        capabilities: {
          tools: { enabled: ['terminal'], disabled: [] },
          skills: { enabled: [], disabled: [], directories: [path.join(root, '.sisu', 'skills')] },
          middleware: {
            enabled: ['error-boundary', 'invariants', 'register-tools', 'tool-calling', 'conversation-buffer', 'skills'],
            disabled: [],
            pipeline: [
              { id: 'error-boundary', enabled: true, config: {} },
              { id: 'invariants', enabled: true, config: {} },
              { id: 'register-tools', enabled: true, config: {} },
              { id: 'tool-calling', enabled: true, config: {} },
              { id: 'conversation-buffer', enabled: true, config: { maxMessages: -1 } },
              { id: 'skills', enabled: true, config: {} },
            ],
          },
        },
      },
    })).rejects.toThrow('E6513');
  });

  test('capability updates do not interrupt in-flight runs', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-capabilities-flight-'));
    tempDirs.push(root);

    const runtime = await ChatRuntime.create({
      cwd: root,
      profile: baseProfile(path.join(root, 'sessions')),
      provider: {
        id: 'slow',
        async *streamResponse(input) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          if (!input.signal.aborted) {
            yield { type: 'delta', text: 'ok' };
          }
          yield { type: 'done' };
        },
      },
    });

    const runPromise = runtime.runPrompt('hello');
    await runtime.setCapabilityEnabled('skills', false, 'session');
    const result = await runPromise;
    expect(result.summary.status).toBe('completed');
    expect(runtime.isCapabilityEnabled('skills')).toBe(false);
  });

  test('rejects disabling locked capability', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-capabilities-lock-'));
    tempDirs.push(root);

    const runtime = await ChatRuntime.create({
      cwd: root,
      profile: baseProfile(path.join(root, 'sessions')),
    });

    await expect(runtime.setCapabilityEnabled('terminal', false, 'session')).rejects.toThrow('E6506');
  });

  test('runtime pipeline update rejects unknown middleware entry', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-capabilities-pipeline-'));
    tempDirs.push(root);
    const runtime = await ChatRuntime.create({
      cwd: root,
      profile: baseProfile(path.join(root, 'sessions')),
    });

    await expect(runtime.setMiddlewarePipeline([{ id: 'missing-mw', enabled: true, config: {} }], 'session'))
      .rejects.toThrow('E6509');
  });

  test('runtime resolves tool-calling max rounds from middleware config', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-capabilities-max-rounds-'));
    tempDirs.push(root);
    const runtime = await ChatRuntime.create({
      cwd: root,
      profile: baseProfile(path.join(root, 'sessions')),
    });
    expect(runtime.getToolCallingMaxRounds()).toBe(16);
    await runtime.setMiddlewareConfig('tool-calling', { maxRounds: 20 }, 'session');
    expect(runtime.getToolCallingMaxRounds()).toBe(20);
  });

  test('open-config requires EDITOR/VISUAL', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-capabilities-editor-'));
    tempDirs.push(root);
    const runtime = await ChatRuntime.create({
      cwd: root,
      profile: baseProfile(path.join(root, 'sessions')),
    });

    const previousEditor = process.env.EDITOR;
    const previousVisual = process.env.VISUAL;
    delete process.env.EDITOR;
    delete process.env.VISUAL;
    await expect(runtime.openConfigInEditor('project')).rejects.toThrow('E6510');
    process.env.EDITOR = previousEditor;
    process.env.VISUAL = previousVisual;
  });

  test('open-config uses editor when configured', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-capabilities-editor-ok-'));
    tempDirs.push(root);
    const runtime = await ChatRuntime.create({
      cwd: root,
      profile: baseProfile(path.join(root, 'sessions')),
    });

    const previousEditor = process.env.EDITOR;
    const previousVisual = process.env.VISUAL;
    process.env.EDITOR = 'true';
    process.env.VISUAL = '';

    const opened = await runtime.openConfigInEditor('project');
    expect(opened.endsWith(path.join('.sisu', 'chat-profile.json'))).toBe(true);
    await expect(fs.access(opened)).resolves.toBeUndefined();
    process.env.EDITOR = previousEditor;
    process.env.VISUAL = previousVisual;
  });

  test('profile persistence helpers write capability and allow-list overrides', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-capabilities-persist-'));
    tempDirs.push(root);
    const projectPath = path.join(root, '.sisu', 'chat-profile.json');
    const globalPath = path.join(root, '.sisu', 'global-chat-profile.json');

    const profileWithCaps = await persistCapabilityOverride(
      {
        skills: {
          enabled: ['skill-debug'],
          disabled: [],
          directories: [path.join(root, '.sisu', 'skills')],
        },
        middleware: {
          enabled: ['skills'],
          disabled: [],
          pipeline: [{ id: 'skills', enabled: true, config: { directories: [path.join(root, '.sisu', 'skills')] } }],
        },
      },
      'project',
      { cwd: root, homeDir: root, projectPath, globalPath },
    );
    expect(profileWithCaps.capabilities?.skills.enabled).toContain('skill-debug');

    const profileWithAllow = await persistAllowCommandPrefix('echo', 'project', {
      cwd: root,
      homeDir: root,
      projectPath,
      globalPath,
    });
    expect(profileWithAllow.toolPolicy.allowCommandPrefixes).toContain('echo');
  });

  test('persistCapabilityOverride merges enabled/disabled sets instead of replacing them', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-capabilities-merge-enabled-'));
    tempDirs.push(root);
    const projectPath = path.join(root, '.sisu', 'chat-profile.json');
    const globalPath = path.join(root, '.sisu', 'global-chat-profile.json');
    await fs.mkdir(path.dirname(projectPath), { recursive: true });
    await fs.writeFile(
      projectPath,
      JSON.stringify({
        capabilities: {
          tools: {
            enabled: ['tool-web-search-duckduckgo'],
            disabled: ['tool-rag'],
          },
        },
      }),
      'utf8',
    );

    const profile = await persistCapabilityOverride(
      {
        tools: {
          enabled: ['tool-rag'],
          disabled: [],
        },
      },
      'project',
      { cwd: root, homeDir: root, projectPath, globalPath },
    );

    const enabled = profile.capabilities?.tools.enabled || [];
    const disabled = profile.capabilities?.tools.disabled || [];
    expect(enabled).toContain('tool-rag');
    expect(enabled).toContain('tool-web-search-duckduckgo');
    expect(disabled).not.toContain('tool-rag');
  });

  test('persistAllowCommandPrefix rejects empty prefixes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-capabilities-allow-empty-'));
    tempDirs.push(root);
    await expect(
      persistAllowCommandPrefix('   ', 'project', {
        cwd: root,
        homeDir: root,
        projectPath: path.join(root, '.sisu', 'chat-profile.json'),
        globalPath: path.join(root, '.sisu', 'global-chat-profile.json'),
      }),
    ).rejects.toThrow('E6511');
  });

  test('loadResolvedProfile reports invalid JSON and non-object profile files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-capabilities-invalid-profile-'));
    tempDirs.push(root);
    const projectPath = path.join(root, '.sisu', 'chat-profile.json');
    const globalPath = path.join(root, '.sisu', 'global-chat-profile.json');
    await fs.mkdir(path.dirname(projectPath), { recursive: true });

    await fs.writeFile(projectPath, '{', 'utf8');
    await expect(
      loadResolvedProfile({
        cwd: root,
        homeDir: root,
        projectPath,
        globalPath,
      }),
    ).rejects.toThrow('Failed to parse JSON profile');

    await fs.writeFile(projectPath, JSON.stringify(['not-an-object']), 'utf8');
    await expect(
      loadResolvedProfile({
        cwd: root,
        homeDir: root,
        projectPath,
        globalPath,
      }),
    ).rejects.toThrow('must be a JSON object');
  });

  test('loadResolvedProfile autoselects ollama model when provider is explicit ollama without model', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-capabilities-ollama-auto-model-'));
    tempDirs.push(root);
    const projectPath = path.join(root, '.sisu', 'chat-profile.json');
    const globalPath = path.join(root, '.sisu', 'global-chat-profile.json');
    await fs.mkdir(path.dirname(projectPath), { recursive: true });
    await fs.writeFile(projectPath, JSON.stringify({ provider: 'ollama' }), 'utf8');

    const resolved = await loadResolvedProfile({
      cwd: root,
      homeDir: root,
      projectPath,
      globalPath,
      installedOllamaModels: ['qwen3.5:9b', 'llama3.1'],
    });
    expect(resolved.provider).toBe('ollama');
    expect(resolved.model).toBe('qwen3.5:9b');
  });
});
