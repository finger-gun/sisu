export interface ToolConfigOptionDescriptor {
  path: string;
  type: 'boolean' | 'integer' | 'number' | 'string[]' | 'enum';
  description: string;
  enumValues?: string[];
}

export interface ToolConfigPreset {
  id: string;
  label: string;
  description: string;
  config: Record<string, unknown>;
}

export interface ToolConfigDescriptor {
  schemaVersion: 1;
  toolId: string;
  title: string;
  description: string;
  options: ToolConfigOptionDescriptor[];
  presets: ToolConfigPreset[];
}

const TERMINAL_OPTIONS: ToolConfigOptionDescriptor[] = [
  { path: 'capabilities.read', type: 'boolean', description: 'Allow file reads.' },
  { path: 'capabilities.write', type: 'boolean', description: 'Allow file writes.' },
  { path: 'capabilities.delete', type: 'boolean', description: 'Allow file deletions.' },
  { path: 'capabilities.exec', type: 'boolean', description: 'Allow command execution.' },
  { path: 'commands.allow', type: 'string[]', description: 'Allowed command prefixes/globs.' },
  { path: 'execution.timeoutMs', type: 'integer', description: 'Command timeout in milliseconds.' },
  { path: 'execution.maxStdoutBytes', type: 'integer', description: 'Max captured stdout bytes.' },
  { path: 'execution.maxStderrBytes', type: 'integer', description: 'Max captured stderr bytes.' },
  { path: 'execution.pathDirs', type: 'string[]', description: 'PATH search directories.' },
  { path: 'allowPipe', type: 'boolean', description: "Allow shell pipe operator '|'" },
  { path: 'allowSequence', type: 'boolean', description: "Allow shell sequence operators ';', '&&', '||'" },
  { path: 'sessions.enabled', type: 'boolean', description: 'Enable terminal sessions.' },
  { path: 'sessions.ttlMs', type: 'integer', description: 'Session TTL in milliseconds.' },
  { path: 'sessions.maxPerAgent', type: 'integer', description: 'Max sessions per agent.' },
];

const TERMINAL_PRESETS: ToolConfigPreset[] = [
  {
    id: 'read-only',
    label: 'Read-only (Recommended)',
    description: 'Read/exec enabled. Write/delete disabled.',
    config: {
      capabilities: { read: true, write: false, delete: false, exec: true },
      commands: { allow: ['pwd', 'ls', 'stat', 'wc', 'head', 'tail', 'cat', 'cut', 'sort', 'uniq', 'grep'] },
      allowPipe: true,
      allowSequence: true,
    },
  },
  {
    id: 'workspace-write',
    label: 'Read + write',
    description: 'Read/exec/write enabled. Delete disabled.',
    config: {
      capabilities: { read: true, write: true, delete: false, exec: true },
      commands: {
        allow: [
          'pwd', 'ls', 'stat', 'wc', 'head', 'tail', 'cat', 'cut', 'sort', 'uniq', 'grep',
          'touch', 'mkdir', 'cp', 'mv', 'sed', 'tee', 'echo',
        ],
      },
      allowPipe: true,
      allowSequence: true,
    },
  },
  {
    id: 'full-access',
    label: 'Read + write + delete',
    description: 'Read/exec/write/delete enabled.',
    config: {
      capabilities: { read: true, write: true, delete: true, exec: true },
      commands: {
        allow: [
          'pwd', 'ls', 'stat', 'wc', 'head', 'tail', 'cat', 'cut', 'sort', 'uniq', 'grep',
          'touch', 'mkdir', 'cp', 'mv', 'sed', 'tee', 'echo', 'rm',
        ],
      },
      allowPipe: true,
      allowSequence: true,
    },
  },
  {
    id: 'no-exec',
    label: 'No execution',
    description: 'Disable command execution entirely.',
    config: { capabilities: { exec: false } },
  },
];

const TERMINAL_DESCRIPTOR: ToolConfigDescriptor = {
  schemaVersion: 1,
  toolId: 'terminal',
  title: 'Terminal tool config',
  description: 'Shell permissions and command execution policy.',
  options: TERMINAL_OPTIONS,
  presets: TERMINAL_PRESETS,
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function validateNoUnknownFields(
  id: string,
  config: Record<string, unknown>,
  knownFields: string[],
): string[] {
  const issues: string[] = [];
  const known = new Set(knownFields);
  for (const key of Object.keys(config)) {
    if (!known.has(key)) {
      issues.push(`Unknown option '${key}' for tool '${id}'.`);
    }
  }
  return issues;
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.trim().length > 0);
}

function isPositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

function validateTerminalToolConfig(config: Record<string, unknown>): string[] {
  const issues = validateNoUnknownFields('terminal', config, [
    'capabilities',
    'commands',
    'execution',
    'allowPipe',
    'allowSequence',
    'sessions',
  ]);

  if (config.capabilities !== undefined) {
    const caps = asRecord(config.capabilities);
    if (!caps) {
      issues.push("Option 'capabilities' must be an object.");
    } else {
      issues.push(...validateNoUnknownFields('terminal.capabilities', caps, ['read', 'write', 'delete', 'exec']));
      for (const key of ['read', 'write', 'delete', 'exec'] as const) {
        if (caps[key] !== undefined && typeof caps[key] !== 'boolean') {
          issues.push(`Option 'capabilities.${key}' must be boolean.`);
        }
      }
    }
  }

  if (config.commands !== undefined) {
    const commands = asRecord(config.commands);
    if (!commands) {
      issues.push("Option 'commands' must be an object.");
    } else {
      issues.push(...validateNoUnknownFields('terminal.commands', commands, ['allow']));
      if (commands.allow !== undefined && !isStringArray(commands.allow)) {
        issues.push("Option 'commands.allow' must be an array of non-empty strings.");
      }
    }
  }

  if (config.execution !== undefined) {
    const execution = asRecord(config.execution);
    if (!execution) {
      issues.push("Option 'execution' must be an object.");
    } else {
      issues.push(...validateNoUnknownFields('terminal.execution', execution, [
        'timeoutMs',
        'maxStdoutBytes',
        'maxStderrBytes',
        'pathDirs',
      ]));
      if (execution.timeoutMs !== undefined && !isPositiveInteger(execution.timeoutMs)) {
        issues.push("Option 'execution.timeoutMs' must be a positive integer.");
      }
      if (execution.maxStdoutBytes !== undefined && !isPositiveInteger(execution.maxStdoutBytes)) {
        issues.push("Option 'execution.maxStdoutBytes' must be a positive integer.");
      }
      if (execution.maxStderrBytes !== undefined && !isPositiveInteger(execution.maxStderrBytes)) {
        issues.push("Option 'execution.maxStderrBytes' must be a positive integer.");
      }
      if (execution.pathDirs !== undefined && !isStringArray(execution.pathDirs)) {
        issues.push("Option 'execution.pathDirs' must be an array of non-empty strings.");
      }
    }
  }

  if (config.allowPipe !== undefined && typeof config.allowPipe !== 'boolean') {
    issues.push("Option 'allowPipe' must be boolean.");
  }
  if (config.allowSequence !== undefined && typeof config.allowSequence !== 'boolean') {
    issues.push("Option 'allowSequence' must be boolean.");
  }

  if (config.sessions !== undefined) {
    const sessions = asRecord(config.sessions);
    if (!sessions) {
      issues.push("Option 'sessions' must be an object.");
    } else {
      issues.push(...validateNoUnknownFields('terminal.sessions', sessions, ['enabled', 'ttlMs', 'maxPerAgent']));
      if (sessions.enabled !== undefined && typeof sessions.enabled !== 'boolean') {
        issues.push("Option 'sessions.enabled' must be boolean.");
      }
      if (sessions.ttlMs !== undefined && !isPositiveInteger(sessions.ttlMs)) {
        issues.push("Option 'sessions.ttlMs' must be a positive integer.");
      }
      if (sessions.maxPerAgent !== undefined && !isPositiveInteger(sessions.maxPerAgent)) {
        issues.push("Option 'sessions.maxPerAgent' must be a positive integer.");
      }
    }
  }

  return issues;
}

export function getToolConfigDescriptor(toolId: string): ToolConfigDescriptor | undefined {
  if (toolId === 'terminal') {
    return TERMINAL_DESCRIPTOR;
  }
  return undefined;
}

export function validateToolConfig(toolId: string, config: Record<string, unknown>): string[] {
  const descriptor = getToolConfigDescriptor(toolId);
  if (!descriptor) {
    return [];
  }
  if (toolId === 'terminal') {
    return validateTerminalToolConfig(config);
  }
  return [];
}
