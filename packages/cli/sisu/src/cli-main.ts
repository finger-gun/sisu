import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface as createPromptInterface } from 'node:readline/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { stdin, stdout } from 'node:process';
import { Command } from 'commander';
import prompts from 'prompts';
import { categories, formatInfo, formatList, getTemplateIds, listCategory, resolveEntry, scaffoldTemplate } from './lib.js';
import { runChatCli } from './chat/runtime.js';
import { getDiscoveryDiagnostics, listOfficialPackages } from './chat/npm-discovery.js';
import { installSkill, resolveSkillTargetRoot } from './chat/skill-install.js';
import { installCapabilityPackage } from './chat/capability-install.js';
import type { CatalogCategory } from './catalog.js';

const require = createRequire(import.meta.url);
const { version, bugs } = require('../package.json') as { version: string; bugs?: { url?: string } };

export class CliError extends Error {
  readonly code: string;

  readonly hint?: string;

  readonly exitCode: number;

  constructor(code: string, message: string, options?: { hint?: string; exitCode?: number }) {
    super(message);
    this.name = 'CliError';
    this.code = code;
    this.hint = options?.hint;
    this.exitCode = options?.exitCode ?? 1;
  }
}

const banner = String.raw` ░▒▓███████▓▒░▒▓█▓▒░░▒▓███████▓▒░▒▓█▓▒░░▒▓█▓▒░ 
░▒▓█▓▒░      ░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░ 
░▒▓█▓▒░      ░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░ 
 ░▒▓██████▓▒░░▒▓█▓▒░░▒▓██████▓▒░░▒▓█▓▒░░▒▓█▓▒░ 
       ░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░ 
       ░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░ 
░▒▓███████▓▒░░▒▓█▓▒░▒▓███████▓▒░ ░▒▓██████▓▒░  
                                                
                                                
sisu - AI Framework -  github.com/finger-gun/sisu`;

export function printHelp(): void {
  console.log(`${banner}

Sisu CLI

Usage:
  sisu list <category>
  sisu info <name>
  sisu create <template> <project-name>
  sisu list-official <middleware|tools|skills>
  sisu install <tool|middleware> <name> [--global|--project]
  sisu install recipe <rag-recommended|rag-advanced> [--global|--project] [--backend vectra|chroma|custom] [--package <name>]
  sisu install-skill <package-or-path> [--global|--project] [--dir <path>] [--official]
  sisu install skill [installer-options]
  sisu chat [--session <session-id>] [--prompt <text>]

Global options:
  -h, --help        Show help
  -V, --version     Show version
  --json            Structured JSON output (supported by list/info)
  --debug           Show stack traces for failures

Categories:
  ${categories.join(', ')}

Examples:
  sisu list tools
  sisu list-official tools
  sisu install tool terminal --project
  sisu install recipe rag-recommended --project
  sisu info vector-vectra
  sisu create chat-agent my-app
  sisu install-skill @sisu-ai/skill-debug --project
  sisu install skill
  sisu chat
  sisu chat --prompt "run: git status"
`);
}

function buildBugReportUrl(error: Error, code: string): string | undefined {
  const base = bugs?.url;
  if (!base) {
    return undefined;
  }
  const body = [
    `CLI version: ${version}`,
    `Error code: ${code}`,
    '',
    'Message:',
    error.message,
    '',
    'Stack:',
    error.stack || '<none>',
  ].join('\n');
  return `${base}/new?title=${encodeURIComponent(`[${code}] ${error.message}`)}&body=${encodeURIComponent(body)}`;
}

async function promptIfMissing(value: string | undefined, question: string, options?: string[]): Promise<string> {
  if (value) {
    return value;
  }

  if (!stdin.isTTY || !stdout.isTTY) {
    throw new CliError('E1004', `${question} is required in non-interactive mode.`, {
      hint: 'Run with the required argument, or use an interactive terminal.',
      exitCode: 2,
    });
  }

  if (options && options.length > 0) {
    const response = await prompts({
      type: 'select',
      name: 'value',
      message: question,
      choices: options.map((choice) => ({ title: choice, value: choice })),
    });
    if (!response.value) {
      throw new CliError('E1005', 'No selection provided.', {
        hint: `Choose one of: ${options.join(', ')}`,
        exitCode: 2,
      });
    }
    return response.value;
  }

  const ui = createPromptInterface({ input: stdin, output: stdout });
  try {
    const answer = (await ui.question(`${question}: `)).trim();
    if (!answer) {
      throw new CliError('E1006', `${question} cannot be empty.`, { exitCode: 2 });
    }
    return answer;
  } finally {
    ui.close();
  }
}

function getTemplateRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(currentDir, 'templates');
}

function getSkillInstallerCliPath(): string {
  const require = createRequire(import.meta.url);
  try {
    const installerPackageJson = require.resolve('@sisu-ai/skill-install/package.json');
    return path.join(path.dirname(installerPackageJson), 'dist', 'cli.js');
  } catch {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const fallback = path.resolve(currentDir, '../../../skills/skill-install/dist/cli.js');
    if (existsSync(fallback)) {
      return fallback;
    }
    throw new CliError(
      'E1201',
      'Could not resolve @sisu-ai/skill-install.',
      { hint: 'Build or install the skill installer package first.' },
    );
  }
}

interface GlobalCliOptions {
  json: boolean;
  debug: boolean;
}

export function parseGlobalOptions(argv: string[]): { args: string[]; options: GlobalCliOptions } {
  const command = new Command()
    .exitOverride()
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .option('--json', 'Structured JSON output')
    .option('--debug', 'Show stack traces for failures')
    .option('--verbose', 'Alias for --debug');

  let opts: { json?: boolean; debug?: boolean; verbose?: boolean } = {};
  try {
    command.parse(['node', 'sisu', ...argv], { from: 'node' });
    opts = command.opts<{ json?: boolean; debug?: boolean; verbose?: boolean }>();
  } catch {
    opts = {};
  }

  const args = argv.filter((token) => token !== '--json' && token !== '--debug' && token !== '--verbose');
  const options: GlobalCliOptions = {
    json: Boolean(opts.json) || argv.includes('--json'),
    debug: Boolean(process.env.DEBUG) || Boolean(opts.debug) || Boolean(opts.verbose) || argv.includes('--debug') || argv.includes('--verbose'),
  };

  return { args, options };
}

export async function runCli(argsInput: string[]): Promise<void> {
  const { args, options } = parseGlobalOptions(argsInput);
  const [command, arg1, arg2, ...rest] = args;

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === '--version' || command === '-V') {
    console.log(version);
    return;
  }

  if (command === 'list') {
    const category = await promptIfMissing(arg1, 'Category', categories);
    if (!categories.includes(category as CatalogCategory)) {
      throw new CliError('E1001', `Unknown category: ${category}`, {
        hint: `Use one of: ${categories.join(', ')}`,
        exitCode: 2,
      });
    }
    const result = listCategory(category as CatalogCategory);
    console.log(options.json ? JSON.stringify(result, null, 2) : formatList(result));
    return;
  }

  if (command === 'info') {
    const name = await promptIfMissing(arg1, 'Package/template name');
    const entry = resolveEntry(name);
    if (!entry) {
      throw new CliError('E1002', `Unknown Sisu package or template: ${name}`, {
        hint: 'Run `sisu list templates` or `sisu list tools` to discover valid names.',
        exitCode: 2,
      });
    }
    console.log(options.json ? JSON.stringify(entry, null, 2) : formatInfo(entry));
    return;
  }

  if (command === 'create') {
    const templateId = await promptIfMissing(arg1, 'Template', getTemplateIds());
    const projectName = await promptIfMissing(arg2, 'Project name');
    if (!getTemplateIds().includes(templateId)) {
      throw new CliError('E1003', `Unknown template: ${templateId}`, {
        hint: `Choose one of: ${getTemplateIds().join(', ')}`,
        exitCode: 2,
      });
    }
    const destination = await scaffoldTemplate({
      templateId,
      projectName,
      templateRoot: getTemplateRoot(),
    });
    console.log(`Created ${templateId} project at ${destination}`);
    console.log('Next steps:');
    console.log(`- cd ${projectName}`);
    console.log('- npm install');
    console.log('- npm run dev');
    return;
  }

  if (command === 'list-official') {
    const category = await promptIfMissing(arg1, 'Official category', ['middleware', 'tools', 'skills']);
    if (category !== 'middleware' && category !== 'tools' && category !== 'skills') {
      throw new CliError('E1205', `Unknown official category: ${category}`, {
        hint: 'Use one of: middleware, tools, skills.',
        exitCode: 2,
      });
    }
    const packages = await listOfficialPackages(category);
    const diagnostics = getDiscoveryDiagnostics();
    if (diagnostics.length > 0) {
      console.log(`Discovery note: ${diagnostics[0]}`);
    }
    if (options.json) {
      console.log(JSON.stringify(packages, null, 2));
      return;
    }
    if (packages.length === 0) {
      console.log(`No official ${category} packages found.`);
      return;
    }
    for (const pkg of packages) {
      console.log(`- ${pkg.name}@${pkg.version} ${pkg.description}`);
    }
    return;
  }

  if (command === 'install') {
    if (arg1 === 'skill') {
      const installerCliPath = getSkillInstallerCliPath();

      await new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, [installerCliPath, arg2, ...rest].filter(Boolean), {
          stdio: 'inherit',
        });
        child.on('exit', (code) => {
          if (code && code !== 0) {
            reject(new CliError('E1202', `@sisu-ai/skill-install exited with code ${code}`));
            return;
          }
          resolve();
        });
        child.on('error', reject);
      });
      return;
    }

    const type = arg1;
    const name = arg2;
    if (type === 'recipe') {
      if (!name) {
        throw new CliError('E1101', 'Usage: sisu install recipe <rag-recommended|rag-advanced> [--global|--project] [--backend vectra|chroma|custom] [--package <name>]', { exitCode: 2 });
      }
      let scope: 'project' | 'global' = 'project';
      let backend: 'vectra' | 'chroma' | 'custom' = 'vectra';
      let customPackage: string | undefined;
      const optionTokens = rest.filter((token): token is string => typeof token === 'string');
      for (let index = 0; index < optionTokens.length; index += 1) {
        const token = optionTokens[index];
        if (token === '--global') {
          scope = 'global';
          continue;
        }
        if (token === '--project') {
          scope = 'project';
          continue;
        }
        if (token === '--backend') {
          const value = optionTokens[index + 1];
          if (!value || (value !== 'vectra' && value !== 'chroma' && value !== 'custom')) {
            throw new CliError('E1212', 'Invalid --backend value. Use vectra, chroma, or custom.', { exitCode: 2 });
          }
          backend = value;
          index += 1;
          continue;
        }
        if (token === '--package') {
          const value = optionTokens[index + 1];
          if (!value) {
            throw new CliError('E1213', 'Missing value for --package.', { exitCode: 2 });
          }
          customPackage = value;
          index += 1;
          continue;
        }
        throw new CliError('E1211', `Unknown install recipe option: ${token}`, {
          hint: 'Use --global, --project, --backend, --package.',
          exitCode: 2,
        });
      }
      if (backend === 'custom' && !customPackage) {
        throw new CliError('E1214', 'Custom backend requires --package <name>.', { exitCode: 2 });
      }
      const runtime = await (await import('./chat/runtime.js')).ChatRuntime.create();
      const result = await runtime.installRecipe(name, scope, {
        resolveChoice: async () => ({
          optionId: backend,
          customPackageName: customPackage,
        }),
      });
      if (result.status === 'cancelled') {
        console.log(`Recipe ${name} cancelled.`);
        return;
      }
      if (result.status === 'failed') {
        throw new CliError('E1215', `Recipe ${name} failed at ${result.failedStep || 'unknown step'}: ${result.error || 'unknown error'}`);
      }
      console.log(`Installed recipe ${name} (${scope}).`);
      console.log(`Completed steps: ${result.completedSteps.length}`);
      return;
    }

    if ((type !== 'tool' && type !== 'middleware') || !name) {
      throw new CliError('E1101', 'Usage: sisu install <tool|middleware> <name> [--global|--project] OR sisu install recipe <id> [options] OR sisu install skill [installer-options]', { exitCode: 2 });
    }
    let scope: 'project' | 'global' = 'project';
    const optionTokens = rest.filter((token): token is string => typeof token === 'string');
    for (const token of optionTokens) {
      if (token === '--global') {
        scope = 'global';
        continue;
      }
      if (token === '--project') {
        scope = 'project';
        continue;
      }
      throw new CliError('E1210', `Unknown install option: ${token}`, {
        hint: 'Use --global or --project.',
        exitCode: 2,
      });
    }
    const result = await installCapabilityPackage({ type, name, scope });
    console.log(`Installed ${result.record.packageName} as ${result.record.id} (${scope}).`);
    console.log(`Install directory: ${result.record.installDir}`);
    console.log(`Manifest: ${result.manifestPath}`);
    return;
  }

  if (command === 'install-skill') {
    const packageOrPath = await promptIfMissing(arg1, 'Skill package name (or local path)');
    let scope: 'project' | 'global' = 'project';
    let dir: string | undefined;
    let officialOnly = false;
    const optionTokens = [arg2, ...rest].filter((token): token is string => typeof token === 'string');
    for (let index = 0; index < optionTokens.length; index += 1) {
      const token = optionTokens[index];
      if (token === '--global') {
        scope = 'global';
        continue;
      }
      if (token === '--project') {
        scope = 'project';
        continue;
      }
      if (token === '--official') {
        officialOnly = true;
        continue;
      }
      if (token.startsWith('--dir=')) {
        dir = token.slice('--dir='.length);
        continue;
      }
      if (token === '--dir') {
        const value = optionTokens[index + 1];
        if (!value) {
          throw new CliError('E1203', 'Missing value for --dir', { exitCode: 2 });
        }
        dir = value;
        index += 1;
        continue;
      }
      throw new CliError('E1204', `Unknown install-skill option: ${token}`, {
        hint: 'Use --global, --project, --dir <path>, or --official.',
        exitCode: 2,
      });
    }

    const result = await installSkill({ packageOrPath, scope, dir, officialOnly });
    const root = resolveSkillTargetRoot({ scope, dir });
    console.log(`Installed skill '${result.skillId}' to ${result.targetDir}`);
    console.log(`Skill root: ${root}`);
    return;
  }

  if (command === 'chat') {
    await runChatCli([arg1, arg2, ...rest].filter((value): value is string => typeof value === 'string'));
    return;
  }

  throw new CliError('E1000', `Unknown command: ${command}`, {
    hint: 'Run `sisu --help` to see available commands.',
    exitCode: 2,
  });
}

export async function runCliEntrypoint(argsInput = process.argv.slice(2)): Promise<number> {
  try {
    await runCli(argsInput);
    return 0;
  } catch (error) {
    const normalized = error instanceof CliError
      ? error
      : new CliError('E9000', error instanceof Error ? error.message : String(error));

    const wrapped = error instanceof Error ? error : new Error(String(error));
    console.error(`sisu v${version} — Error (${normalized.code}): ${normalized.message}`);
    if (normalized.hint) {
      console.error(`Hint: ${normalized.hint}`);
    }
    const reportUrl = buildBugReportUrl(wrapped, normalized.code);
    if (reportUrl) {
      console.error(`Report: ${reportUrl}`);
    }
    if (process.env.DEBUG || argsInput.includes('--debug') || argsInput.includes('--verbose')) {
      console.error(wrapped.stack || String(wrapped));
    }
    return normalized.exitCode;
  }
}
