import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const templateSourceDir = path.join(packageRoot, 'templates');
const templateTargetDir = path.join(packageRoot, 'dist', 'templates');
const skillSourceDir = path.join(packageRoot, 'assets', 'skills');
const skillTargetDir = path.join(packageRoot, 'dist', 'assets', 'skills');
const discoverySourceDir = path.join(packageRoot, '..', '..', 'discovery', 'src', 'generated');
const discoveryTargetDir = path.join(packageRoot, 'dist', 'discovery');

await fs.rm(templateTargetDir, { recursive: true, force: true });
await fs.mkdir(path.dirname(templateTargetDir), { recursive: true });
await fs.cp(templateSourceDir, templateTargetDir, { recursive: true });

await fs.rm(skillTargetDir, { recursive: true, force: true });
await fs.mkdir(path.dirname(skillTargetDir), { recursive: true });
await fs.cp(skillSourceDir, skillTargetDir, { recursive: true });

await fs.rm(discoveryTargetDir, { recursive: true, force: true });
await fs.mkdir(path.dirname(discoveryTargetDir), { recursive: true });
await fs.cp(discoverySourceDir, discoveryTargetDir, { recursive: true });
