import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { formatInfo, listCategory, renderTemplate, resolveEntry, scaffoldTemplate } from '../src/lib.js';

vi.mock('../src/chat/discovery-package.js', () => ({
  loadDiscoveryCatalog: () => ({
    schemaVersion: 1,
    generatedAt: 'now',
    entries: [
      {
        id: 'vector-vectra',
        category: 'vector',
        title: '@sisu-ai/vector-vectra',
        packageName: '@sisu-ai/vector-vectra',
        version: '1.0.0',
        summary: 'Vectra vector store',
        aliases: ['vectra'],
      },
      {
        id: 'tool-rag',
        category: 'tools',
        title: '@sisu-ai/tool-rag',
        packageName: '@sisu-ai/tool-rag',
        version: '1.0.0',
        summary: 'RAG tool',
      },
      {
        id: 'cli-agent',
        category: 'templates',
        title: 'cli-agent',
        summary: 'CLI template',
      },
    ],
  }),
}));

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('sisu CLI library', () => {
  test('lists tool entries', () => {
    const entries = listCategory('tools');
    expect(entries.some((entry) => entry.id === 'tool-rag')).toBe(true);
  });

  test('resolves entries by alias', () => {
    const entry = resolveEntry('vectra');
    expect(entry?.id).toBe('vector-vectra');
    expect(formatInfo(entry!)).toContain('@sisu-ai/vector-vectra');
  });

  test('renders and scaffolds template files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-cli-'));
    tempDirs.push(root);
    const templateRoot = path.resolve('packages/cli/sisu/templates');

    const destination = await scaffoldTemplate({
      templateId: 'cli-agent',
      projectName: 'demo-app',
      destinationRoot: root,
      templateRoot,
    });

    const pkg = await fs.readFile(path.join(destination, 'package.json'), 'utf8');
    expect(destination).toContain('demo-app');
    expect(pkg).toContain('demo-app');
    expect(renderTemplate('hello {{PROJECT_NAME}}', 'demo-app')).toBe('hello demo-app');
  });
});
