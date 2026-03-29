export type ToolPolicyMode = 'strict' | 'balanced' | 'permissive';

export interface ToolRequest {
  id: string;
  toolName: 'shell';
  command: string;
}

export type ToolDecisionAction = 'allow' | 'deny' | 'confirm';

export interface ToolDecision {
  action: ToolDecisionAction;
  reason: string;
  risk: 'low' | 'high';
}

export interface ToolPolicy {
  mode: ToolPolicyMode;
  allowCommandPrefixes: string[];
  denyCommandPatterns: string[];
  highImpactPatterns: string[];
  requireConfirmationForHighImpact: boolean;
  maxCommandLength: number;
}

export const DEFAULT_TOOL_POLICY: ToolPolicy = {
  mode: 'balanced',
  allowCommandPrefixes: ['echo', 'cat', 'ls', 'pwd', 'git status', 'git diff', 'pnpm test', 'pnpm lint', 'pnpm build'],
  denyCommandPatterns: ['(^|\\s)sudo(\\s|$)', '(^|\\s)rm\\s+-rf(\\s|$)', '(^|\\s)mkfs(\\s|$)', '(^|\\s)dd(\\s|$)'],
  highImpactPatterns: [
    '(^|\\s)git\\s+reset\\s+--hard(\\s|$)',
    '(^|\\s)git\\s+clean\\s+-fd(\\s|$)',
    '(^|\\s)npm\\s+publish(\\s|$)',
    '(^|\\s)pnpm\\s+publish(\\s|$)',
    '(^|\\s)rm\\s+(?!-rf)(\\S+)'
  ],
  requireConfirmationForHighImpact: true,
  maxCommandLength: 2000,
};

function matchesAny(command: string, patterns: string[]): boolean {
  return patterns.some((pattern) => new RegExp(pattern, 'i').test(command));
}

function startsWithAllowedPrefix(command: string, prefixes: string[]): boolean {
  const normalized = command.trim().toLowerCase();
  return prefixes.some((prefix) => normalized.startsWith(prefix.toLowerCase()));
}

export function mergeToolPolicy(overrides?: Partial<ToolPolicy>): ToolPolicy {
  if (!overrides) {
    return { ...DEFAULT_TOOL_POLICY };
  }

  return {
    ...DEFAULT_TOOL_POLICY,
    ...overrides,
    allowCommandPrefixes: overrides.allowCommandPrefixes || DEFAULT_TOOL_POLICY.allowCommandPrefixes,
    denyCommandPatterns: overrides.denyCommandPatterns || DEFAULT_TOOL_POLICY.denyCommandPatterns,
    highImpactPatterns: overrides.highImpactPatterns || DEFAULT_TOOL_POLICY.highImpactPatterns,
  };
}

export function evaluateToolRequest(request: ToolRequest, policy: ToolPolicy): ToolDecision {
  if (request.command.trim().length === 0) {
    return {
      action: 'deny',
      risk: 'low',
      reason: 'Command cannot be empty.',
    };
  }

  if (request.command.length > policy.maxCommandLength) {
    return {
      action: 'deny',
      risk: 'high',
      reason: `Command exceeds max length of ${policy.maxCommandLength}.`,
    };
  }

  if (matchesAny(request.command, policy.denyCommandPatterns)) {
    return {
      action: 'deny',
      risk: 'high',
      reason: 'Command matches a denied pattern.',
    };
  }

  const highImpact = matchesAny(request.command, policy.highImpactPatterns);
  if (highImpact && policy.requireConfirmationForHighImpact) {
    return {
      action: 'confirm',
      risk: 'high',
      reason: 'High-impact command requires confirmation.',
    };
  }

  if (policy.mode === 'strict' && !startsWithAllowedPrefix(request.command, policy.allowCommandPrefixes)) {
    return {
      action: 'deny',
      risk: highImpact ? 'high' : 'low',
      reason: 'Strict mode allows only configured command prefixes.',
    };
  }

  if (policy.mode === 'balanced' && !startsWithAllowedPrefix(request.command, policy.allowCommandPrefixes)) {
    return {
      action: 'confirm',
      risk: highImpact ? 'high' : 'low',
      reason: 'Command is outside allowlist and requires confirmation in balanced mode.',
    };
  }

  return {
    action: 'allow',
    risk: highImpact ? 'high' : 'low',
    reason: 'Command allowed by policy.',
  };
}
