import { test, expect } from 'vitest';
import { createTerminalTool } from '../src/index.js';

const root = process.cwd();

const tool = createTerminalTool({ roots: [root] });

test('run_command executes allowed command', async () => {
  const res = await tool.run_command({ command: 'echo hello' });
  expect(res.policy.allowed).toBe(true);
  expect(res.stdout.trim()).toBe('hello');
});

test('run_command blocks denied command', async () => {
  const res = await tool.run_command({ command: 'sudo ls' });
  expect(res.policy.allowed).toBe(false);
});

test('read_file refuses outside roots', async () => {
  await expect(tool.read_file({ path: '/etc/passwd' })).rejects.toThrow();
});

test('cd cannot escape root', async () => {
  const { sessionId } = tool.start_session({ cwd: root });
  expect(() => tool.cd({ sessionId, path: '..' })).toThrow();
});
