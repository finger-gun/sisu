#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { createInstallPlan, installTargets, type InstallScope, type InstallTargetId, updateManagedSection } from './lib.js';

interface CliOptions {
  target?: InstallTargetId;
  scope?: InstallScope;
  dir?: string;
  yes?: boolean;
  list?: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const out: CliOptions = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (arg === '--yes' || arg === '-y') out.yes = true;
    else if (arg === '--list') out.list = true;
    else if (arg.startsWith('--target=')) out.target = arg.slice('--target='.length) as InstallTargetId;
    else if (arg === '--target') out.target = argv[index + 1] as InstallTargetId;
    else if (arg.startsWith('--scope=')) out.scope = arg.slice('--scope='.length) as InstallScope;
    else if (arg === '--scope') out.scope = argv[index + 1] as InstallScope;
    else if (arg.startsWith('--dir=')) out.dir = arg.slice('--dir='.length);
    else if (arg === '--dir') out.dir = argv[index + 1];
  }
  return out;
}

async function promptForSelection(question: string, choices: string[]): Promise<number> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question}\n${choices.map((choice, index) => `${index + 1}. ${choice}`).join('\n')}\n> `);
    const parsed = Number.parseInt(answer, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > choices.length) {
      throw new Error('Invalid selection.');
    }
    return parsed - 1;
  } finally {
    rl.close();
  }
}

async function promptForText(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question}\n> `);
    const trimmed = answer.trim();
    if (!trimmed) {
      throw new Error('Value is required.');
    }
    return trimmed;
  } finally {
    rl.close();
  }
}

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${question} [y/N]\n> `)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

async function copyDir(sourceDir: string, targetDir: string): Promise<void> {
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(targetDir), { recursive: true });
  await fs.cp(sourceDir, targetDir, { recursive: true });
}

async function writeManagedFile(filePath: string, section: string): Promise<void> {
  let current = '';
  try {
    current = await fs.readFile(filePath, 'utf8');
  } catch {
    current = '';
  }
  const updated = updateManagedSection(current, 'sisu-framework', section);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, updated);
}

function getAssetDir(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(currentDir, 'assets', 'sisu-framework');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.list) {
    for (const target of installTargets) {
      console.log(`${target.id} - ${target.label}`);
    }
    return;
  }

  let targetId = options.target;
  if (!targetId) {
    const index = await promptForSelection(
      'Choose an install target:',
      installTargets.map((target) => `${target.label}${target.notes ? ` — ${target.notes}` : ''}`),
    );
    targetId = installTargets[index]?.id;
  }
  if (!targetId) {
    throw new Error('Install target is required.');
  }

  const target = installTargets.find((entry) => entry.id === targetId);
  if (!target) {
    throw new Error(`Unknown target: ${targetId}`);
  }

  let scope = options.scope;
  if (!scope) {
    if (target.supports.length === 1) {
      scope = target.supports[0];
    } else {
      const index = await promptForSelection(
        `Choose install scope for ${target.label}:`,
        target.supports.map((entry) => entry),
      );
      scope = target.supports[index];
    }
  }
  if (!scope) {
    throw new Error('Install scope is required.');
  }

  let customDir = options.dir;
  if (scope === 'custom' || target.kind === 'custom') {
    customDir = customDir || (await promptForText('Enter the target directory path:'));
  }

  const plan = createInstallPlan({ target: target.id, scope, customDir });
  console.log(`\nPlan:\n- ${plan.summary}`);
  if (!options.yes) {
    const accepted = await confirm('Continue?');
    if (!accepted) {
      console.log('Cancelled.');
      return;
    }
  }

  const assetDir = getAssetDir();
  await copyDir(assetDir, plan.skillDir);
  if (plan.adapterFile && plan.adapterSection) {
    await writeManagedFile(plan.adapterFile, plan.adapterSection);
  }

  console.log('\nInstalled Sisu framework skill.');
  console.log(`- Skill path: ${plan.skillDir}`);
  if (plan.adapterFile) {
    console.log(`- Adapter file: ${plan.adapterFile}`);
  }
}

await main();
