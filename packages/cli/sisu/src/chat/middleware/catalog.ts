export interface MiddlewareConfigOptionDescriptor {
  path: string;
  type: 'boolean' | 'integer' | 'number' | 'string[]' | 'enum' | 'string';
  description: string;
  enumValues?: string[];
}

export interface MiddlewareConfigPreset {
  id: string;
  label: string;
  description: string;
  config: Record<string, unknown>;
}

export interface MiddlewareConfigDescriptor {
  schemaVersion: 1;
  middlewareId: string;
  title: string;
  description: string;
  options: MiddlewareConfigOptionDescriptor[];
  presets: MiddlewareConfigPreset[];
}

export interface MiddlewareCatalogEntry {
  id: string;
  packageName: string;
  description: string;
  lockedCore?: boolean;
  defaultEnabled?: boolean;
  validateConfig?: (config: Record<string, unknown>) => string[];
  configDescriptor?: MiddlewareConfigDescriptor;
}

export const CORE_MIDDLEWARE_ORDER = [
  'error-boundary',
  'invariants',
  'register-tools',
  'tool-calling',
] as const;

const CORE_SET = new Set<string>(CORE_MIDDLEWARE_ORDER);

export const MIDDLEWARE_CATALOG: MiddlewareCatalogEntry[] = [
  {
    id: 'error-boundary',
    packageName: '@sisu-ai/mw-error-boundary',
    description: 'Structured runtime error boundaries.',
    lockedCore: true,
    defaultEnabled: true,
  },
  {
    id: 'invariants',
    packageName: '@sisu-ai/mw-invariants',
    description: 'Protocol invariants and safety checks.',
    lockedCore: true,
    defaultEnabled: true,
  },
  {
    id: 'register-tools',
    packageName: '@sisu-ai/mw-register-tools',
    description: 'Registers tools into runtime context.',
    lockedCore: true,
    defaultEnabled: true,
  },
  {
    id: 'tool-calling',
    packageName: '@sisu-ai/mw-tool-calling',
    description: 'Runs the tool loop over model tool calls.',
    lockedCore: true,
    defaultEnabled: true,
  },
  {
    id: 'conversation-buffer',
    packageName: '@sisu-ai/mw-conversation-buffer',
    description: 'Bounds conversation history.',
    defaultEnabled: true,
  },
  {
    id: 'skills',
    packageName: '@sisu-ai/mw-skills',
    description: 'Loads filesystem skills and use_skill tool.',
    defaultEnabled: true,
  },
  {
    id: 'guardrails',
    packageName: '@sisu-ai/mw-guardrails',
    description: 'Runtime safety constraints and policy checks.',
  },
  {
    id: 'usage-tracker',
    packageName: '@sisu-ai/mw-usage-tracker',
    description: 'Token and usage telemetry.',
  },
  {
    id: 'trace-viewer',
    packageName: '@sisu-ai/mw-trace-viewer',
    description: 'Execution trace output.',
  },
  {
    id: 'context-compressor',
    packageName: '@sisu-ai/mw-context-compressor',
    description: 'Context compression before model calls.',
  },
  {
    id: 'control-flow',
    packageName: '@sisu-ai/mw-control-flow',
    description: 'Branching and orchestration primitives.',
  },
  {
    id: 'orchestration',
    packageName: '@sisu-ai/mw-orchestration',
    description: 'Multi-step orchestration middleware.',
  },
  {
    id: 'rag',
    packageName: '@sisu-ai/mw-rag',
    description: 'RAG middleware for retrieval-augmented flows.',
  },
];

const MIDDLEWARE_CONFIG_DESCRIPTORS: Record<string, MiddlewareConfigDescriptor> = {
  'tool-calling': {
    schemaVersion: 1,
    middlewareId: 'tool-calling',
    title: 'Tool-calling middleware config',
    description: 'Controls automatic tool-call loop behavior.',
    options: [
      {
        path: 'maxRounds',
        type: 'integer',
        description: 'Maximum tool-calling rounds before the assistant stops the loop safely.',
      },
    ],
    presets: [
      {
        id: 'default',
        label: 'Default (16 rounds)',
        description: 'Balanced default with safe upper bound.',
        config: { maxRounds: 16 },
      },
      {
        id: 'extended',
        label: 'Extended (24 rounds)',
        description: 'Allows more agentic tool work before loop cutoff.',
        config: { maxRounds: 24 },
      },
    ],
  },
  'conversation-buffer': {
    schemaVersion: 1,
    middlewareId: 'conversation-buffer',
    title: 'Conversation buffer config',
    description: 'Controls retained conversation history size.',
    options: [
      {
        path: 'maxMessages',
        type: 'integer',
        description: 'Maximum number of messages kept in the rolling buffer.',
      },
    ],
    presets: [
      {
        id: 'compact',
        label: 'Compact (24 messages)',
        description: 'Smaller history for lower token usage.',
        config: { maxMessages: 24 },
      },
      {
        id: 'balanced',
        label: 'Balanced (60 messages)',
        description: 'Default-like balance between context and cost.',
        config: { maxMessages: 60 },
      },
    ],
  },
  skills: {
    schemaVersion: 1,
    middlewareId: 'skills',
    title: 'Skills middleware config',
    description: 'Configures skill discovery directories.',
    options: [
      {
        path: 'directories',
        type: 'string[]',
        description: 'Directories searched for skills.',
      },
    ],
    presets: [
      {
        id: 'defaults',
        label: 'Use profile skill directories',
        description: 'Keeps middleware config empty and uses profile defaults.',
        config: {},
      },
    ],
  },
  'trace-viewer': {
    schemaVersion: 1,
    middlewareId: 'trace-viewer',
    title: 'Trace viewer middleware config',
    description: 'Controls trace output generation and destination.',
    options: [
      {
        path: 'enable',
        type: 'boolean',
        description: 'Explicitly enable or disable trace output.',
      },
      {
        path: 'dir',
        type: 'string',
        description: 'Directory used for generated traces when path is not set.',
      },
      {
        path: 'path',
        type: 'string',
        description: 'Explicit trace output file path.',
      },
      {
        path: 'html',
        type: 'boolean',
        description: 'Write HTML output.',
      },
      {
        path: 'json',
        type: 'boolean',
        description: 'Write JSON output.',
      },
      {
        path: 'style',
        type: 'enum',
        enumValues: ['light', 'dark'],
        description: 'Trace HTML theme.',
      },
    ],
    presets: [
      {
        id: 'html-default',
        label: 'HTML traces',
        description: 'Enable trace-viewer with HTML output in default directory.',
        config: { enable: true, html: true, json: false },
      },
      {
        id: 'html-json',
        label: 'HTML + JSON',
        description: 'Enable trace-viewer and write both HTML and JSON traces.',
        config: { enable: true, html: true, json: true },
      },
    ],
  },
  rag: {
    schemaVersion: 1,
    middlewareId: 'rag',
    title: 'RAG middleware config',
    description: 'Selects retrieval backend and vector package.',
    options: [
      {
        path: 'backend',
        type: 'enum',
        enumValues: ['vectra', 'chroma', 'custom'],
        description: 'Vector backend strategy.',
      },
      {
        path: 'vectorPackage',
        type: 'string',
        description: 'Explicit vector package when using custom backend.',
      },
    ],
    presets: [
      {
        id: 'vectra',
        label: 'Vectra backend',
        description: 'Local vectra vector store.',
        config: { backend: 'vectra' },
      },
      {
        id: 'chroma',
        label: 'Chroma backend',
        description: 'Chroma vector store integration.',
        config: { backend: 'chroma' },
      },
    ],
  },
};

function validateNoUnknownFields(
  id: string,
  config: Record<string, unknown>,
  knownFields: string[],
): string[] {
  const issues: string[] = [];
  const known = new Set(knownFields);
  for (const key of Object.keys(config)) {
    if (!known.has(key)) {
      issues.push(`Unknown option '${key}' for middleware '${id}'.`);
    }
  }
  return issues;
}

function validateConversationBuffer(config: Record<string, unknown>): string[] {
  const issues = validateNoUnknownFields('conversation-buffer', config, ['maxMessages']);
  if (config.maxMessages !== undefined) {
    const value = config.maxMessages;
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      issues.push("Option 'maxMessages' must be a positive integer.");
    }
  }
  return issues;
}

function validateToolCalling(config: Record<string, unknown>): string[] {
  const issues = validateNoUnknownFields('tool-calling', config, ['maxRounds']);
  if (config.maxRounds !== undefined) {
    const value = config.maxRounds;
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      issues.push("Option 'maxRounds' must be a positive integer.");
    }
  }
  return issues;
}

function validateSkills(config: Record<string, unknown>): string[] {
  const issues = validateNoUnknownFields('skills', config, ['directories']);
  if (config.directories !== undefined) {
    if (!Array.isArray(config.directories) || config.directories.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
      issues.push("Option 'directories' must be an array of non-empty strings.");
    }
  }
  return issues;
}

function validateRag(config: Record<string, unknown>): string[] {
  const issues = validateNoUnknownFields('rag', config, ['backend', 'vectorPackage']);
  if (config.backend !== undefined) {
    if (config.backend !== 'vectra' && config.backend !== 'chroma' && config.backend !== 'custom') {
      issues.push("Option 'backend' must be one of: vectra, chroma, custom.");
    }
  }
  if (config.vectorPackage !== undefined) {
    if (typeof config.vectorPackage !== 'string' || config.vectorPackage.trim().length === 0) {
      issues.push("Option 'vectorPackage' must be a non-empty string.");
    }
  }
  return issues;
}

function validateTraceViewer(config: Record<string, unknown>): string[] {
  const issues = validateNoUnknownFields('trace-viewer', config, ['enable', 'dir', 'path', 'html', 'json', 'style']);
  if (config.enable !== undefined && typeof config.enable !== 'boolean') {
    issues.push("Option 'enable' must be a boolean.");
  }
  if (config.dir !== undefined && (typeof config.dir !== 'string' || config.dir.trim().length === 0)) {
    issues.push("Option 'dir' must be a non-empty string.");
  }
  if (config.path !== undefined && (typeof config.path !== 'string' || config.path.trim().length === 0)) {
    issues.push("Option 'path' must be a non-empty string.");
  }
  if (config.html !== undefined && typeof config.html !== 'boolean') {
    issues.push("Option 'html' must be a boolean.");
  }
  if (config.json !== undefined && typeof config.json !== 'boolean') {
    issues.push("Option 'json' must be a boolean.");
  }
  if (config.style !== undefined && config.style !== 'light' && config.style !== 'dark') {
    issues.push("Option 'style' must be one of: light, dark.");
  }
  return issues;
}

function withValidators(entries: MiddlewareCatalogEntry[]): MiddlewareCatalogEntry[] {
  return entries.map((entry) => {
    const descriptor = MIDDLEWARE_CONFIG_DESCRIPTORS[entry.id];
    if (entry.id === 'tool-calling') {
      return { ...entry, configDescriptor: descriptor, validateConfig: validateToolCalling };
    }
    if (entry.id === 'conversation-buffer') {
      return { ...entry, configDescriptor: descriptor, validateConfig: validateConversationBuffer };
    }
    if (entry.id === 'skills') {
      return { ...entry, configDescriptor: descriptor, validateConfig: validateSkills };
    }
    if (entry.id === 'trace-viewer') {
      return { ...entry, configDescriptor: descriptor, validateConfig: validateTraceViewer };
    }
    if (entry.id === 'rag') {
      return { ...entry, configDescriptor: descriptor, validateConfig: validateRag };
    }
    return {
      ...entry,
      configDescriptor: descriptor,
      validateConfig: (config) => validateNoUnknownFields(entry.id, config, []),
    };
  });
}

const WITH_VALIDATORS = withValidators(MIDDLEWARE_CATALOG);

export function getMiddlewareCatalogEntry(id: string): MiddlewareCatalogEntry | undefined {
  return WITH_VALIDATORS.find((entry) => entry.id === id);
}

export function validateMiddlewareConfig(id: string, config: Record<string, unknown>): string[] {
  const entry = getMiddlewareCatalogEntry(id);
  if (!entry) {
    return [`Unknown middleware id '${id}'.`];
  }
  return entry.validateConfig ? entry.validateConfig(config) : [];
}

export function getMiddlewareConfigDescriptor(id: string): MiddlewareConfigDescriptor | undefined {
  return getMiddlewareCatalogEntry(id)?.configDescriptor;
}

export function isLockedCoreMiddleware(id: string): boolean {
  return CORE_SET.has(id);
}

export function getLockedCoreMiddlewareIds(): string[] {
  return [...CORE_MIDDLEWARE_ORDER];
}
