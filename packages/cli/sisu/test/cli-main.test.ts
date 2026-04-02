import { describe, expect, test, vi } from 'vitest';
import * as npmDiscovery from '../src/chat/npm-discovery.js';
import * as skillInstall from '../src/chat/skill-install.js';
import * as capabilityInstall from '../src/chat/capability-install.js';
import * as chatRuntime from '../src/chat/runtime.js';
import { parseGlobalOptions, runCli, runCliEntrypoint } from '../src/cli-main.js';

vi.mock('../src/chat/discovery-package.js', () => ({
  loadDiscoveryCatalog: () => ({
    schemaVersion: 1,
    generatedAt: 'now',
    entries: [
      {
        id: 'tool-terminal',
        category: 'tools',
        title: '@sisu-ai/tool-terminal',
        packageName: '@sisu-ai/tool-terminal',
        version: '1.2.3',
        summary: 'Terminal tool',
      },
    ],
  }),
  loadDiscoveryRecipes: () => ({
    schemaVersion: 1,
    generatedAt: 'now',
    recipes: [
      {
        id: 'rag-advanced',
        label: 'RAG (Advanced)',
        description: 'Advanced flow',
        kind: 'bundle',
        category: 'middleware',
        installs: [],
        postInstall: [],
        choices: [{
          id: 'vector-backend',
          label: 'Vector backend',
          options: [{ id: 'custom', label: 'Custom' }],
          allowCustomPackage: true,
        }],
      },
    ],
  }),
}));

describe('cli main', () => {
  test('prints help banner', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runCli(['--help']);
    expect(log.mock.calls.some((call) => String(call[0]).includes('Sisu CLI'))).toBe(true);
    log.mockRestore();
  });

  test('prints version', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runCli(['--version']);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^0\.\d+\.\d+/));
    log.mockRestore();
  });

  test('list emits JSON with --json', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runCli(['--json', 'list', 'tools']);
    expect(log.mock.calls.some((call) => String(call[0]).includes('"id"'))).toBe(true);
    log.mockRestore();
  });

  test('unknown command returns coded non-zero in entrypoint', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const code = await runCliEntrypoint(['wat']);
    expect(code).toBe(2);
    expect(err.mock.calls.some((call) => String(call[0]).includes('E1000'))).toBe(true);
    err.mockRestore();
  });

  test('install usage validation returns E1101', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const code = await runCliEntrypoint(['install', 'nope']);
    expect(code).toBe(2);
    expect(err.mock.calls.some((call) => String(call[0]).includes('E1101'))).toBe(true);
    err.mockRestore();
  });

  test('install tool forwards to capability installer', async () => {
    const installSpy = vi.spyOn(capabilityInstall, 'installCapabilityPackage').mockResolvedValue({
      record: {
        id: 'tool-azure-blob',
        type: 'tool',
        packageName: '@sisu-ai/tool-azure-blob',
        installDir: '/tmp/.sisu/capabilities/tools/azure-blob',
        installedAt: new Date().toISOString(),
        source: 'project',
      },
      manifestPath: '/tmp/.sisu/capabilities/manifest.json',
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runCli(['install', 'tool', 'azure-blob', '--project']);
    expect(installSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'tool',
      name: 'azure-blob',
      scope: 'project',
    }));
    installSpy.mockRestore();
    log.mockRestore();
  });

  test('install middleware rejects unknown options with E1210', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const code = await runCliEntrypoint(['install', 'middleware', 'skills', '--wat']);
    expect(code).toBe(2);
    expect(err.mock.calls.some((call) => String(call[0]).includes('E1210'))).toBe(true);
    err.mockRestore();
  });

  test('install recipe uses runtime recipe execution with backend option', async () => {
    const installRecipe = vi.fn(async () => ({
      recipeId: 'rag-advanced',
      status: 'completed',
      completedSteps: [{ kind: 'install' }],
    }));
    const createSpy = vi.spyOn(chatRuntime.ChatRuntime, 'create').mockResolvedValue({
      installRecipe,
    } as unknown as chatRuntime.ChatRuntime);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runCli(['install', 'recipe', 'rag-advanced', '--project', '--backend', 'custom', '--package', '@sisu-ai/vector-x']);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(installRecipe).toHaveBeenCalledWith(
      'rag-advanced',
      'project',
      expect.objectContaining({
        resolveChoice: expect.any(Function),
      }),
    );
    log.mockRestore();
    createSpy.mockRestore();
  });

  test('install recipe validates backend options and package requirement', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const invalidBackend = await runCliEntrypoint(['install', 'recipe', 'rag-advanced', '--backend', 'wat']);
    expect(invalidBackend).toBe(2);
    expect(err.mock.calls.some((call) => String(call[0]).includes('E1212'))).toBe(true);
    err.mockClear();
    const missingPackage = await runCliEntrypoint(['install', 'recipe', 'rag-advanced', '--backend', 'custom']);
    expect(missingPackage).toBe(2);
    expect(err.mock.calls.some((call) => String(call[0]).includes('E1214'))).toBe(true);
    err.mockRestore();
  });

  test('list unknown category returns E1001', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const code = await runCliEntrypoint(['list', 'wat']);
    expect(code).toBe(2);
    expect(err.mock.calls.some((call) => String(call[0]).includes('E1001'))).toBe(true);
    err.mockRestore();
  });

  test('info unknown name returns E1002', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const code = await runCliEntrypoint(['info', 'not-a-real-entry']);
    expect(code).toBe(2);
    expect(err.mock.calls.some((call) => String(call[0]).includes('E1002'))).toBe(true);
    err.mockRestore();
  });

  test('create unknown template returns E1003', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const code = await runCliEntrypoint(['create', 'unknown-template', 'my-app']);
    expect(code).toBe(2);
    expect(err.mock.calls.some((call) => String(call[0]).includes('E1003'))).toBe(true);
    err.mockRestore();
  });

  test('list-official renders packages', async () => {
    const listSpy = vi.spyOn(npmDiscovery, 'listOfficialPackages').mockResolvedValue([
      { name: '@sisu-ai/tool-terminal', version: '1.2.3', description: 'Terminal tool' },
    ]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runCli(['list-official', 'tools']);
    expect(log.mock.calls.some((call) => String(call[0]).includes('@sisu-ai/tool-terminal@1.2.3'))).toBe(true);
    listSpy.mockRestore();
    log.mockRestore();
  });

  test('list-official surfaces discovery diagnostics', async () => {
    const listSpy = vi.spyOn(npmDiscovery, 'listOfficialPackages').mockResolvedValue([
      { name: '@sisu-ai/tool-terminal', version: '1.2.3', description: 'Terminal tool' },
    ]);
    const diagnosticsSpy = vi.spyOn(npmDiscovery, 'getDiscoveryDiagnostics').mockReturnValue(['Discovery unavailable, fallback used']);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runCli(['list-official', 'tools']);
    expect(log.mock.calls.some((call) => String(call[0]).includes('Discovery unavailable'))).toBe(true);
    diagnosticsSpy.mockRestore();
    listSpy.mockRestore();
    log.mockRestore();
  });

  test('list-official rejects unknown category with E1205', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const code = await runCliEntrypoint(['list-official', 'wat']);
    expect(code).toBe(2);
    expect(err.mock.calls.some((call) => String(call[0]).includes('E1205'))).toBe(true);
    err.mockRestore();
  });

  test('install-skill parses scope/official flags', async () => {
    const installSpy = vi.spyOn(skillInstall, 'installSkill').mockResolvedValue({
      skillId: 'debug',
      targetDir: '/tmp/.sisu/skills/debug',
      sourceType: 'npm',
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runCli(['install-skill', '@sisu-ai/skill-debug', '--global', '--official']);
    expect(installSpy).toHaveBeenCalledWith(expect.objectContaining({
      packageOrPath: '@sisu-ai/skill-debug',
      scope: 'global',
      officialOnly: true,
    }));
    expect(log.mock.calls.some((call) => String(call[0]).includes("Installed skill 'debug'"))).toBe(true);
    installSpy.mockRestore();
    log.mockRestore();
  });

  test('install-skill accepts --dir=value syntax', async () => {
    const installSpy = vi.spyOn(skillInstall, 'installSkill').mockResolvedValue({
      skillId: 'debug',
      targetDir: '/tmp/custom/debug',
      sourceType: 'npm',
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runCli(['install-skill', '@sisu-ai/skill-debug', '--dir=/tmp/custom']);
    expect(installSpy).toHaveBeenCalledWith(expect.objectContaining({
      packageOrPath: '@sisu-ai/skill-debug',
      dir: '/tmp/custom',
      scope: 'project',
    }));
    expect(log.mock.calls.some((call) => String(call[0]).includes("Installed skill 'debug'"))).toBe(true);
    installSpy.mockRestore();
    log.mockRestore();
  });

  test('install-skill accepts --dir <value> syntax', async () => {
    const installSpy = vi.spyOn(skillInstall, 'installSkill').mockResolvedValue({
      skillId: 'debug',
      targetDir: '/tmp/custom2/debug',
      sourceType: 'npm',
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runCli(['install-skill', '@sisu-ai/skill-debug', '--dir', '/tmp/custom2']);
    expect(installSpy).toHaveBeenCalledWith(expect.objectContaining({
      packageOrPath: '@sisu-ai/skill-debug',
      dir: '/tmp/custom2',
      scope: 'project',
    }));
    installSpy.mockRestore();
    log.mockRestore();
  });

  test('install-skill honors explicit --project scope', async () => {
    const installSpy = vi.spyOn(skillInstall, 'installSkill').mockResolvedValue({
      skillId: 'debug',
      targetDir: '/tmp/.sisu/skills/debug',
      sourceType: 'npm',
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runCli(['install-skill', '@sisu-ai/skill-debug', '--global', '--project']);
    expect(installSpy).toHaveBeenCalledWith(expect.objectContaining({
      packageOrPath: '@sisu-ai/skill-debug',
      scope: 'project',
    }));
    installSpy.mockRestore();
    log.mockRestore();
  });

  test('install-skill rejects unknown option with E1204', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const code = await runCliEntrypoint(['install-skill', '@sisu-ai/skill-debug', '--wat']);
    expect(code).toBe(2);
    expect(err.mock.calls.some((call) => String(call[0]).includes('E1204'))).toBe(true);
    err.mockRestore();
  });

  test('install-skill requires value for --dir with E1203', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const code = await runCliEntrypoint(['install-skill', '@sisu-ai/skill-debug', '--dir']);
    expect(code).toBe(2);
    expect(err.mock.calls.some((call) => String(call[0]).includes('E1203'))).toBe(true);
    err.mockRestore();
  });

  test('create command fails with E9000 when template root is unavailable in src mode', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const code = await runCliEntrypoint(['create', 'chat-agent', `tmp-cli-main-${Date.now().toString(36)}`]);
    expect([1, 2]).toContain(code);
    expect(err.mock.calls.some((call) => String(call[0]).includes('E9000') || String(call[0]).includes('E1003'))).toBe(true);
    err.mockRestore();
  });

  test('parseGlobalOptions recognizes verbose/debug aliases', () => {
    const parsed = parseGlobalOptions(['--verbose', '--json', 'list', 'tools']);
    expect(parsed.options.debug).toBe(true);
    expect(parsed.options.json).toBe(true);
    expect(parsed.args).toEqual(['list', 'tools']);
  });

  test('list-official prints empty state', async () => {
    const listSpy = vi.spyOn(npmDiscovery, 'listOfficialPackages').mockResolvedValue([]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runCli(['list-official', 'skills']);
    expect(log.mock.calls.some((call) => String(call[0]).includes('No official skills packages found.'))).toBe(true);
    listSpy.mockRestore();
    log.mockRestore();
  });

  test('runCliEntrypoint prints stack when debug flag is set', async () => {
    const installSpy = vi.spyOn(skillInstall, 'installSkill').mockRejectedValue(new Error('boom-debug'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const code = await runCliEntrypoint(['--debug', 'install-skill', '@sisu-ai/skill-debug']);
    expect(code).toBe(1);
    expect(err.mock.calls.some((call) => String(call[0]).includes('boom-debug'))).toBe(true);
    expect(err.mock.calls.some((call) => String(call[0]).includes('Error: boom-debug'))).toBe(true);
    installSpy.mockRestore();
    err.mockRestore();
  });

  test('runCliEntrypoint returns zero on success', async () => {
    const code = await runCliEntrypoint(['--help']);
    expect(code).toBe(0);
  });

  test('chat command forwards remaining args to chat runtime', async () => {
    const runChatSpy = vi.spyOn(chatRuntime, 'runChatCli').mockResolvedValue(undefined);
    await runCli(['chat', '--prompt', 'hello']);
    expect(runChatSpy).toHaveBeenCalledWith(['--prompt', 'hello']);
    runChatSpy.mockRestore();
  });
});
