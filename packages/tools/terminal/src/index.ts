import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { exec as cpExec } from 'node:child_process';
import { promisify } from 'node:util';
import { minimatch } from 'minimatch';
import type { Tool } from '@sisu-ai/core';
import { z } from 'zod';

const exec = promisify(cpExec);

export interface TerminalToolConfig {
  roots: string[];
  readOnlyRoots?: string[];
  capabilities: {
    read: boolean;
    write: boolean;
    delete: boolean;
    exec: boolean;
  };
  commands: {
    allow: string[];
    deny: string[];
  };
  execution: {
    timeoutMs: number;
    maxStdoutBytes: number;
    maxStderrBytes: number;
    shell: 'sh' | 'bash' | 'powershell' | 'cmd' | 'direct';
  };
  sessions: {
    enabled: boolean;
    ttlMs: number;
    maxPerAgent: number;
  };
}

export const DEFAULT_CONFIG: TerminalToolConfig = {
  roots: [process.cwd()],
  capabilities: { read: true, write: false, delete: false, exec: true },
  commands: {
    allow: [
      'pwd',
      'ls',
      'cat',
      'head',
      'tail',
      'stat',
      'wc',
      'grep',
      'find',
      'echo',
      'sed',
      'awk',
      'cut',
      'sort',
      'uniq',
      'xargs',
      'node',
      'npm',
      'pnpm',
      'yarn'
    ],
    deny: [
      'sudo',
      'chmod',
      'chown',
      'mount',
      'umount',
      'shutdown',
      'reboot',
      'dd',
      'mkfs*',
      'service',
      'systemctl',
      'iptables',
      'firewall*',
      'curl *',
      'wget *'
    ]
  },
  execution: {
    timeoutMs: 10_000,
    maxStdoutBytes: 1_000_000,
    maxStderrBytes: 250_000,
    shell: 'direct'
  },
  sessions: { enabled: true, ttlMs: 120_000, maxPerAgent: 4 }
};

interface Session {
  cwd: string;
  env: Record<string, string>;
  expiresAt: number;
}

function isCommandAllowed(cmd: string, policy: TerminalToolConfig['commands']): boolean {
  const normalized = cmd.trim().replace(/\s+/g, ' ');
  const verb = normalized.split(' ')[0] ?? '';
  const candidates = [normalized, verb];
  const opts = { nocase: true, matchBase: true } as const;
  const denyHit = policy.deny.some(p => candidates.some(c => minimatch(c, p, opts)));
  if (denyHit) return false;
  return policy.allow.some(p => candidates.some(c => minimatch(c, p, opts)));
}

function isPathAllowed(absPath: string, cfg: TerminalToolConfig, mode: 'read' | 'write' | 'delete' | 'exec'): boolean {
  const real = path.resolve(absPath);
  const roots = cfg.roots.map(r => path.resolve(r));
  const inside = roots.some(r => real === r || real.startsWith(r + path.sep));
  if (!inside) return false;
  if (mode !== 'read' && cfg.readOnlyRoots) {
    const ro = cfg.readOnlyRoots.map(r => path.resolve(r));
    const inRo = ro.some(r => real === r || real.startsWith(r + path.sep));
    if (inRo) return false;
  }
  return true;
}

export function createTerminalTool(config?: Partial<TerminalToolConfig>) {
  const cfg: TerminalToolConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    capabilities: { ...DEFAULT_CONFIG.capabilities, ...(config?.capabilities ?? {}) },
    commands: {
      allow: config?.commands?.allow ?? DEFAULT_CONFIG.commands.allow,
      deny: config?.commands?.deny ?? DEFAULT_CONFIG.commands.deny
    },
    execution: { ...DEFAULT_CONFIG.execution, ...(config?.execution ?? {}) },
    sessions: { ...DEFAULT_CONFIG.sessions, ...(config?.sessions ?? {}) }
  };

  const sessions = new Map<string, Session>();

  function getSession(id: string | undefined): Session | undefined {
    if (!id) return undefined;
    const s = sessions.get(id);
    if (!s) return undefined;
    if (Date.now() > s.expiresAt) {
      sessions.delete(id);
      return undefined;
    }
    return s;
  }

  function start_session(args?: { cwd?: string; env?: Record<string, string> }) {
    const cwd = args?.cwd ? path.resolve(args.cwd) : cfg.roots[0];
    if (!isPathAllowed(cwd, cfg, 'exec')) {
      throw new Error('cwd outside allowed roots');
    }
    const sessionId = randomUUID();
    const expiresAt = Date.now() + cfg.sessions.ttlMs;
    sessions.set(sessionId, { cwd, env: { ...(args?.env ?? {}) }, expiresAt });
    return { sessionId, expiresAt: new Date(expiresAt).toISOString() };
  }

  async function run_command(args: { command: string; cwd?: string; env?: Record<string, string>; stdin?: string; sessionId?: string }) {
    if (!cfg.capabilities.exec) {
      return { exitCode: -1, stdout: '', stderr: '', durationMs: 0, policy: { allowed: false, reason: 'exec disabled' }, cwd: args.cwd ?? '' };
    }
    const session = getSession(args.sessionId);
    const cwd = path.resolve(args.cwd ?? session?.cwd ?? cfg.roots[0]);
    if (!isPathAllowed(cwd, cfg, 'exec')) {
      return { exitCode: -1, stdout: '', stderr: '', durationMs: 0, policy: { allowed: false, reason: 'cwd outside roots' }, cwd };
    }
    const commandStr = args.command;
    if (!isCommandAllowed(commandStr, cfg.commands)) {
      return { exitCode: -1, stdout: '', stderr: '', durationMs: 0, policy: { allowed: false, reason: 'command denied' }, cwd };
    }
    const start = Date.now();
    try {
      const { stdout: s, stderr: e } = await exec(commandStr, {
        cwd,
        env: { ...(session?.env ?? {}), ...(args.env ?? {}) },
        timeout: cfg.execution.timeoutMs,
        input: args.stdin
      } as any);
      const dur = Date.now() - start;
      let stdout = s ?? '';
      let stderr = e ?? '';
      if (Buffer.byteLength(stdout) > cfg.execution.maxStdoutBytes) {
        stdout = stdout.slice(-cfg.execution.maxStdoutBytes);
      }
      if (Buffer.byteLength(stderr) > cfg.execution.maxStderrBytes) {
        stderr = stderr.slice(-cfg.execution.maxStderrBytes);
      }
      if (session) session.cwd = cwd;
      return { exitCode: 0, stdout, stderr, durationMs: dur, policy: { allowed: true }, cwd };
    } catch (err: any) {
      const dur = Date.now() - start;
      const stdout = String(err.stdout ?? '');
      const stderr = String(err.stderr ?? err.message ?? '');
      const code = typeof err.code === 'number' ? err.code : -1;
      return { exitCode: code, stdout, stderr, durationMs: dur, policy: { allowed: true }, cwd };
    }
  }

  function cd(args: { path: string; sessionId?: string }) {
    let session = getSession(args.sessionId);
    // If no valid session is provided, create one anchored at the first root
    if (!session) {
      const cwd = cfg.roots[0];
      const sessionId = randomUUID();
      const expiresAt = Date.now() + cfg.sessions.ttlMs;
      session = { cwd, env: {}, expiresAt };
      sessions.set(sessionId, session);
      // attach generated id on args for return below
      (args as any)._createdSessionId = sessionId;
    }
    const newPath = path.resolve(session.cwd, args.path);
    if (!isPathAllowed(newPath, cfg, 'exec')) {
      throw new Error('path outside allowed roots');
    }
    session.cwd = newPath;
    session.expiresAt = Date.now() + cfg.sessions.ttlMs;
    return { cwd: session.cwd, sessionId: (args as any)._createdSessionId ?? args.sessionId } as { cwd: string; sessionId?: string };
  }

  async function read_file(args: { path: string; encoding?: 'utf8' | 'base64'; sessionId?: string }) {
    if (!cfg.capabilities.read) throw new Error('read disabled');
    const session = getSession(args.sessionId);
    const cwd = session?.cwd ?? cfg.roots[0];
    const abs = path.resolve(cwd, args.path);
    if (!isPathAllowed(abs, cfg, 'read')) throw new Error('path outside allowed roots');
    const buf = await fs.readFile(abs);
    const encoding = args.encoding ?? 'utf8';
    const contents = encoding === 'base64' ? buf.toString('base64') : buf.toString('utf8');
    return { contents };
  }

  const runCommandTool: Tool<{ command: string; cwd?: string; env?: Record<string, string>; stdin?: string; sessionId?: string }, any> = {
    name: 'terminalRun',
    description:
      [
        'Run a non-interactive, sandboxed terminal command within allowed roots.',
        `Use for listing files (ls), printing files (cat), simple text processing etc. Allowed commands are ${cfg.commands.allow.join(', ')}).`,
        'Always prefer passing a safe single command. Network and destructive commands are denied by policy.',
        'Tips: pass cwd to run in a specific folder; use terminalCd first to set a working directory for subsequent calls; prefer terminalReadFile when you only need file contents.'
      ].join(' '),
    schema: z.object({
      command: z.string(),
      cwd: z.string().optional(),
      env: z.record(z.string()).optional(),
      stdin: z.string().optional(),
      sessionId: z.string().optional()
    }),
    handler: run_command
  };

  const cdTool: Tool<{ path: string; sessionId?: string }, { cwd: string; sessionId?: string }> = {
    name: 'terminalCd',
    description:
      [
        'Change the working directory for subsequent terminal operations.',
        'Accepts a path relative to the current directory or absolute within the configured roots.',
        'If no session exists, creates one and returns sessionId.',
        'Use before terminalRun when you need to run multiple commands in the same folder.'
      ].join(' '),
    schema: z.object({ path: z.string(), sessionId: z.string().optional() }),
    handler: async ({ path, sessionId }) => cd({ path, sessionId })
  };

  const readFileTool: Tool<{ path: string; encoding?: 'utf8' | 'base64'; sessionId?: string }, { contents: string }> = {
    name: 'terminalReadFile',
    description:
      [
        'Read a small text file from the sandboxed workspace.',
        'Prefer this instead of running `cat` when you only need file contents.',
        'Path must be inside allowed roots; returns UTF-8 text by default.'
      ].join(' '),
    schema: z.object({ path: z.string(), encoding: z.enum(['utf8', 'base64']).optional(), sessionId: z.string().optional() }),
    handler: read_file
  };

  // Do not expose start_session as a tool by default to keep the model API simple.
  return { start_session, run_command, cd, read_file, tools: [runCommandTool, cdTool, readFileTool] };
}

export type TerminalTool = ReturnType<typeof createTerminalTool>;
