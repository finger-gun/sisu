import { describe, expect, test } from 'vitest';
import { getToolConfigDescriptor, validateToolConfig } from '../src/chat/tool-config.js';

describe('tool config validation', () => {
  test('returns descriptor for terminal and undefined for unknown tool', () => {
    expect(getToolConfigDescriptor('terminal')?.toolId).toBe('terminal');
    expect(getToolConfigDescriptor('missing-tool')).toBeUndefined();
  });

  test('returns no issues for unknown tool ids', () => {
    expect(validateToolConfig('missing-tool', { anything: true })).toEqual([]);
  });

  test('validates unknown and invalid top-level terminal fields', () => {
    const issues = validateToolConfig('terminal', {
      unknown: true,
      allowPipe: 'yes',
      allowSequence: 1,
    });

    expect(issues.join('\n')).toContain("Unknown option 'unknown' for tool 'terminal'.");
    expect(issues.join('\n')).toContain("Option 'allowPipe' must be boolean.");
    expect(issues.join('\n')).toContain("Option 'allowSequence' must be boolean.");
  });

  test('validates nested capabilities and commands fields', () => {
    const issues = validateToolConfig('terminal', {
      capabilities: { read: 'true', write: 1, extra: true },
      commands: { allow: ['ok', ''] },
    });

    const text = issues.join('\n');
    expect(text).toContain("Unknown option 'extra' for tool 'terminal.capabilities'.");
    expect(text).toContain("Option 'capabilities.read' must be boolean.");
    expect(text).toContain("Option 'capabilities.write' must be boolean.");
    expect(text).toContain("Option 'commands.allow' must be an array of non-empty strings.");
  });

  test('validates execution and sessions nested objects', () => {
    const issues = validateToolConfig('terminal', {
      execution: {
        timeoutMs: 0,
        maxStdoutBytes: 1.5,
        maxStderrBytes: -1,
        pathDirs: ['/bin', ''],
        extra: true,
      },
      sessions: {
        enabled: 'true',
        ttlMs: 0,
        maxPerAgent: -2,
        extra: true,
      },
    });

    const text = issues.join('\n');
    expect(text).toContain("Unknown option 'extra' for tool 'terminal.execution'.");
    expect(text).toContain("Option 'execution.timeoutMs' must be a positive integer.");
    expect(text).toContain("Option 'execution.maxStdoutBytes' must be a positive integer.");
    expect(text).toContain("Option 'execution.maxStderrBytes' must be a positive integer.");
    expect(text).toContain("Option 'execution.pathDirs' must be an array of non-empty strings.");
    expect(text).toContain("Unknown option 'extra' for tool 'terminal.sessions'.");
    expect(text).toContain("Option 'sessions.enabled' must be boolean.");
    expect(text).toContain("Option 'sessions.ttlMs' must be a positive integer.");
    expect(text).toContain("Option 'sessions.maxPerAgent' must be a positive integer.");
  });

  test('validates non-object nested containers', () => {
    const issues = validateToolConfig('terminal', {
      capabilities: 'bad',
      commands: 'bad',
      execution: 'bad',
      sessions: 'bad',
    });

    const text = issues.join('\n');
    expect(text).toContain("Option 'capabilities' must be an object.");
    expect(text).toContain("Option 'commands' must be an object.");
    expect(text).toContain("Option 'execution' must be an object.");
    expect(text).toContain("Option 'sessions' must be an object.");
  });
});
