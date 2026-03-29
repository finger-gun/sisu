export interface MiddlewareCatalogEntry {
  id: string;
  packageName: string;
  description: string;
  lockedCore?: boolean;
  defaultEnabled?: boolean;
  validateConfig?: (config: Record<string, unknown>) => string[];
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

function validateSkills(config: Record<string, unknown>): string[] {
  const issues = validateNoUnknownFields('skills', config, ['directories']);
  if (config.directories !== undefined) {
    if (!Array.isArray(config.directories) || config.directories.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
      issues.push("Option 'directories' must be an array of non-empty strings.");
    }
  }
  return issues;
}

function withValidators(entries: MiddlewareCatalogEntry[]): MiddlewareCatalogEntry[] {
  return entries.map((entry) => {
    if (entry.id === 'conversation-buffer') {
      return { ...entry, validateConfig: validateConversationBuffer };
    }
    if (entry.id === 'skills') {
      return { ...entry, validateConfig: validateSkills };
    }
    return { ...entry, validateConfig: (config) => validateNoUnknownFields(entry.id, config, []) };
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

export function isLockedCoreMiddleware(id: string): boolean {
  return CORE_SET.has(id);
}

export function getLockedCoreMiddlewareIds(): string[] {
  return [...CORE_MIDDLEWARE_ORDER];
}
