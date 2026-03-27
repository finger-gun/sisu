import os from 'node:os';
import path from 'node:path';

export type InstallTargetId =
  | 'claude-code'
  | 'cline'
  | 'roo-code'
  | 'windsurf'
  | 'kilocode'
  | 'codex'
  | 'copilot'
  | 'custom-skill-dir';

export type InstallScope = 'workspace' | 'global' | 'custom';

export interface InstallTarget {
  id: InstallTargetId;
  label: string;
  kind: 'skill-dir' | 'codex-bridge' | 'copilot-bridge' | 'custom';
  supports: InstallScope[];
  notes?: string;
}

export interface InstallPlanOptions {
  target: InstallTargetId;
  scope: InstallScope;
  cwd?: string;
  homeDir?: string;
  customDir?: string;
}

export interface InstallPlan {
  target: InstallTarget;
  scope: InstallScope;
  skillDir: string;
  adapterFile?: string;
  adapterSection?: string;
  summary: string;
}

export const installTargets: InstallTarget[] = [
  {
    id: 'claude-code',
    label: 'Claude Code / Claude Desktop',
    kind: 'skill-dir',
    supports: ['workspace', 'global', 'custom'],
  },
  {
    id: 'cline',
    label: 'Cline',
    kind: 'skill-dir',
    supports: ['workspace', 'custom'],
  },
  {
    id: 'roo-code',
    label: 'Roo Code',
    kind: 'skill-dir',
    supports: ['workspace', 'custom'],
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    kind: 'skill-dir',
    supports: ['workspace', 'global', 'custom'],
  },
  {
    id: 'kilocode',
    label: 'Kilo Code',
    kind: 'skill-dir',
    supports: ['workspace', 'global', 'custom'],
    notes: 'Uses conventional `.kilocode/skills` defaults; adjust with custom if your setup differs.',
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    kind: 'codex-bridge',
    supports: ['workspace', 'custom'],
    notes: 'Installs the full skill under `.sisu/skills/sisu-framework` and adds a managed section to `AGENTS.md`.',
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot',
    kind: 'copilot-bridge',
    supports: ['workspace', 'custom'],
    notes: 'Installs the full skill under `.sisu/skills/sisu-framework` and adds a managed section to `.github/copilot-instructions.md`.',
  },
  {
    id: 'custom-skill-dir',
    label: 'Custom skill directory',
    kind: 'custom',
    supports: ['custom'],
  },
];

function getTarget(id: InstallTargetId): InstallTarget {
  const target = installTargets.find((entry) => entry.id === id);
  if (!target) {
    throw new Error(`Unknown install target: ${id}`);
  }
  return target;
}

function requireCustomDir(customDir: string | undefined): string {
  if (!customDir) {
    throw new Error('Custom directory is required for this install mode.');
  }
  return path.resolve(customDir);
}

function getSkillRoot(target: InstallTargetId, scope: InstallScope, cwd: string, homeDir: string, customDir?: string): string {
  if (target === 'claude-code') {
    if (scope === 'custom') return requireCustomDir(customDir);
    return scope === 'global'
      ? path.join(homeDir, '.claude', 'skills')
      : path.join(cwd, '.claude', 'skills');
  }
  if (target === 'cline') {
    if (scope === 'custom') return requireCustomDir(customDir);
    return path.join(cwd, '.cline', 'skills');
  }
  if (target === 'roo-code') {
    if (scope === 'custom') return requireCustomDir(customDir);
    return path.join(cwd, '.roo', 'skills');
  }
  if (target === 'windsurf') {
    if (scope === 'custom') return requireCustomDir(customDir);
    return scope === 'global'
      ? path.join(homeDir, '.codeium', 'windsurf', 'skills')
      : path.join(cwd, '.windsurf', 'skills');
  }
  if (target === 'kilocode') {
    if (scope === 'custom') return requireCustomDir(customDir);
    return scope === 'global'
      ? path.join(homeDir, '.kilocode', 'skills')
      : path.join(cwd, '.kilocode', 'skills');
  }
  if (target === 'custom-skill-dir') {
    return requireCustomDir(customDir);
  }

  const rootDir = scope === 'custom' ? requireCustomDir(customDir) : cwd;
  return path.join(rootDir, '.sisu', 'skills');
}

function getBridgeAdapterSection(kind: InstallTarget['kind'], skillPath: string): string | undefined {
  if (kind === 'codex-bridge') {
    return [
      '## Sisu Framework',
      'When working on a Sisu app or the Sisu monorepo, use the local Sisu framework reference skill before making architecture changes.',
      '',
      `Primary reference: \`${skillPath}/SKILL.md\``,
      `RAG reference: \`${skillPath}/RAG.md\``,
      `Tools reference: \`${skillPath}/TOOLS.md\``,
      `Examples reference: \`${skillPath}/EXAMPLES.md\``,
      '',
      'Core Sisu rules:',
      '- keep packages small, explicit, and composable',
      '- prefer middleware, tools, adapters, and skill layers over monoliths',
      '- use `@sisu-ai/rag-core`, `@sisu-ai/tool-rag`, and `@sisu-ai/vector-*` according to package boundaries',
      '- check the local project `AGENTS.md` first if one exists; project-specific instructions override this reference',
    ].join('\n');
  }

  if (kind === 'copilot-bridge') {
    return [
      '## Sisu Framework',
      'Use the local Sisu framework reference skill when editing Sisu agents or the Sisu monorepo.',
      '',
      `Reference docs live in \`${skillPath}/\``,
      '',
      'Priority docs:',
      `- \`${skillPath}/SKILL.md\``,
      `- \`${skillPath}/RAG.md\``,
      `- \`${skillPath}/TOOLS.md\``,
      `- \`${skillPath}/EXAMPLES.md\``,
      '',
      'Preferred style:',
      '- small, explicit, composable packages',
      '- backend-agnostic RAG logic in `@sisu-ai/rag-core`',
      '- thin model-facing tools in `@sisu-ai/tool-rag`',
      '- vector contracts in `@sisu-ai/vector-core` and adapters in `@sisu-ai/vector-*`',
    ].join('\n');
  }

  return undefined;
}

function getAdapterFile(kind: InstallTarget['kind'], cwd: string, customDir?: string): string | undefined {
  if (kind === 'codex-bridge') {
    return path.join(customDir ? path.resolve(customDir) : cwd, 'AGENTS.md');
  }
  if (kind === 'copilot-bridge') {
    return path.join(customDir ? path.resolve(customDir) : cwd, '.github', 'copilot-instructions.md');
  }
  return undefined;
}

export function createInstallPlan(options: InstallPlanOptions): InstallPlan {
  const cwd = path.resolve(options.cwd || process.cwd());
  const homeDir = path.resolve(options.homeDir || os.homedir());
  const target = getTarget(options.target);

  if (!target.supports.includes(options.scope)) {
    throw new Error(`${target.label} does not support ${options.scope} installs.`);
  }

  const skillRoot = getSkillRoot(target.id, options.scope, cwd, homeDir, options.customDir);
  const skillDir = path.join(skillRoot, 'sisu-framework');

  if (target.kind === 'skill-dir' || target.kind === 'custom') {
    return {
      target,
      scope: options.scope,
      skillDir,
      summary: `Copy Sisu skill files to \`${skillDir}\``,
    };
  }

  const adapterFile = getAdapterFile(target.kind, cwd, options.customDir);
  const relativeSkillPath = path.relative(path.dirname(adapterFile || cwd), skillDir).replaceAll(path.sep, '/');
  const adapterSection = getBridgeAdapterSection(target.kind, relativeSkillPath);

  return {
    target,
    scope: options.scope,
    skillDir,
    adapterFile,
    adapterSection,
    summary: `Copy Sisu skill files to \`${skillDir}\` and update \`${adapterFile}\``,
  };
}

export function updateManagedSection(existingContent: string, markerId: string, section: string): string {
  const startMarker = `<!-- ${markerId}:start -->`;
  const endMarker = `<!-- ${markerId}:end -->`;
  const block = `${startMarker}\n${section}\n${endMarker}`;
  const pattern = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`, 'm');
  if (pattern.test(existingContent)) {
    return existingContent.replace(pattern, block);
  }
  const trimmed = existingContent.trim();
  return trimmed ? `${trimmed}\n\n${block}\n` : `${block}\n`;
}
