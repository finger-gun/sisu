#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { categories, formatInfo, formatList, getTemplateIds, listCategory, resolveEntry, scaffoldTemplate } from './lib.js';
import type { CatalogCategory } from './catalog.js';

const banner = String.raw` ░▒▓███████▓▒░▒▓█▓▒░░▒▓███████▓▒░▒▓█▓▒░░▒▓█▓▒░ 
░▒▓█▓▒░      ░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░ 
░▒▓█▓▒░      ░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░ 
 ░▒▓██████▓▒░░▒▓█▓▒░░▒▓██████▓▒░░▒▓█▓▒░░▒▓█▓▒░ 
       ░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░ 
       ░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░ 
░▒▓███████▓▒░░▒▓█▓▒░▒▓███████▓▒░ ░▒▓██████▓▒░  
                                               
                                               
sisu - AI Framework -  github.com/finger-gun/sisu`;

function printHelp(): void {
  console.log(`${banner}

Sisu CLI

Usage:
  sisu list <category>
  sisu info <name>
  sisu create <template> <project-name>
  sisu install skill [installer-options]

Categories:
  ${categories.join(', ')}

Examples:
  sisu list tools
  sisu info vector-vectra
  sisu create chat-agent my-app
  sisu install skill
`);
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
    throw new Error('Could not resolve @sisu-ai/skill-install. Build or install the skill installer package first.');
  }
}

async function main(): Promise<void> {
  const [command, arg1, arg2, ...rest] = process.argv.slice(2);

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === 'list') {
    if (!arg1 || !categories.includes(arg1 as CatalogCategory)) {
      throw new Error(`Unknown category. Use one of: ${categories.join(', ')}`);
    }
    console.log(formatList(listCategory(arg1 as CatalogCategory)));
    return;
  }

  if (command === 'info') {
    if (!arg1) {
      throw new Error('Usage: sisu info <name>');
    }
    const entry = resolveEntry(arg1);
    if (!entry) {
      throw new Error(`Unknown Sisu package or template: ${arg1}`);
    }
    console.log(formatInfo(entry));
    return;
  }

  if (command === 'create') {
    if (!arg1 || !arg2) {
      throw new Error('Usage: sisu create <template> <project-name>');
    }
    if (!getTemplateIds().includes(arg1)) {
      throw new Error(`Unknown template: ${arg1}`);
    }
    const destination = await scaffoldTemplate({
      templateId: arg1,
      projectName: arg2,
      templateRoot: getTemplateRoot(),
    });
    console.log(`Created ${arg1} project at ${destination}`);
    console.log('Next steps:');
    console.log(`- cd ${arg2}`);
    console.log('- npm install');
    console.log('- npm run dev');
    return;
  }

  if (command === 'install') {
    if (arg1 !== 'skill') {
      throw new Error('Usage: sisu install skill [installer-options]');
    }
    const installerCliPath = getSkillInstallerCliPath();

    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [installerCliPath, arg2, ...rest].filter(Boolean), {
        stdio: 'inherit',
      });
      child.on('exit', (code) => {
        if (code && code !== 0) {
          reject(new Error(`@sisu-ai/skill-install exited with code ${code}`));
          return;
        }
        resolve();
      });
      child.on('error', reject);
    });
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
