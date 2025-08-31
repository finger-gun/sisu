import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

async function walk(dir, filter) {
  const results = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await walk(full, filter);
      if (nested.length) results.push(...nested);
    } else if (filter(full)) {
      results.push(full);
    }
  }
  return results;
}

async function main() {
  const root = resolve(process.cwd(), 'packages');
  const testFiles = (await walk(root, (p) => p.endsWith('.test.ts'))).sort();

  if (testFiles.length === 0) {
    console.log('No test files found under packages.');
    process.exit(0);
    return;
  }

  const args = ['--loader', 'ts-node/esm', '--test', ...testFiles];
  const child = spawn(process.execPath, args, { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 1));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

