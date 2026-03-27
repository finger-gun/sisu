import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '../../..');
const sourceDir = path.join(repoRoot, 'skills', 'sisu-framework');
const targetDir = path.join(packageRoot, 'dist', 'assets', 'sisu-framework');

await fs.rm(targetDir, { recursive: true, force: true });
await fs.mkdir(path.dirname(targetDir), { recursive: true });
await fs.cp(sourceDir, targetDir, { recursive: true });
