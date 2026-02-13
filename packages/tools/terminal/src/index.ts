import { randomUUID } from "node:crypto";
import { promises as fs, realpathSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { minimatch } from "minimatch";
import type { Tool, ToolContext } from "@sisu-ai/core";
import { z } from "zod";

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
  };
  execution: {
    timeoutMs: number;
    maxStdoutBytes: number;
    maxStderrBytes: number;
    pathDirs: string[]; // PATH search dirs for spawned processes
  };
  // Preferred booleans for opt-in operators
  allowPipe?: boolean; // enable shell-free pipelines with '|'
  allowSequence?: boolean; // enable sequencing with ';', '&&', '||'
  sessions: {
    enabled: boolean;
    ttlMs: number;
    maxPerAgent: number;
  };
}

const DEFAULT_PATH_DIRS: string[] = (() => {
  const base = ["/usr/bin", "/bin", "/usr/local/bin"];
  if (process.platform === "darwin") base.push("/opt/homebrew/bin");
  return base;
})();

export const DEFAULT_CONFIG: TerminalToolConfig = {
  roots: [process.cwd()],
  capabilities: { read: true, write: false, delete: false, exec: true },
  commands: {
    allow: [
      "pwd",
      "ls",
      "stat",
      "wc",
      "head",
      "tail",
      "cat",
      "cut",
      "sort",
      "uniq",
      "grep",
    ],
  },
  execution: {
    timeoutMs: 10_000,
    maxStdoutBytes: 1_000_000,
    maxStderrBytes: 250_000,
    pathDirs: DEFAULT_PATH_DIRS,
  },
  allowPipe: false,
  allowSequence: false,
  sessions: { enabled: true, ttlMs: 120_000, maxPerAgent: 4 },
};

// Reusable exports for consumers who want to surface or extend policy
export const TERMINAL_COMMANDS_ALLOW: ReadonlyArray<string> = Object.freeze([
  ...DEFAULT_CONFIG.commands.allow,
]);

export function defaultTerminalConfig(
  overrides?: Partial<TerminalToolConfig>,
): TerminalToolConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    capabilities: {
      ...DEFAULT_CONFIG.capabilities,
      ...(overrides?.capabilities ?? {}),
    },
    commands: {
      allow: overrides?.commands?.allow ?? DEFAULT_CONFIG.commands.allow,
    },
    execution: { ...DEFAULT_CONFIG.execution, ...(overrides?.execution ?? {}) },
    allowPipe: overrides?.allowPipe ?? DEFAULT_CONFIG.allowPipe,
    allowSequence: overrides?.allowSequence ?? DEFAULT_CONFIG.allowSequence,
    sessions: { ...DEFAULT_CONFIG.sessions, ...(overrides?.sessions ?? {}) },
  };
}

interface Session {
  cwd: string;
  env: Record<string, string>;
  expiresAt: number;
}

interface TerminalPolicy {
  allowed: boolean;
  reason?: string;
  allowedCommands?: string[];
  allowedRoots?: string[];
}

interface TerminalRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  policy: TerminalPolicy;
  message?: string;
  cwd: string;
}

interface TerminalReadResult {
  contents: string;
  policy: TerminalPolicy;
  message?: string;
}

function isCommandAllowed(
  verb: string,
  policy: TerminalToolConfig["commands"],
): boolean {
  const opts = { nocase: true } as const;
  return policy.allow.some((p) => minimatch(verb, p, opts));
}

function canonicalize(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    const dir = realpathSync(path.dirname(p));
    return path.join(dir, path.basename(p));
  }
}

function isPathAllowed(
  absPath: string,
  cfg: TerminalToolConfig,
  mode: "read" | "write" | "delete" | "exec",
): boolean {
  const real = canonicalize(absPath);
  const roots = cfg.roots.map((r) => canonicalize(r));
  const inside = roots.some((r) => real === r || real.startsWith(r + path.sep));
  if (!inside) return false;
  if (mode !== "read" && cfg.readOnlyRoots) {
    const ro = cfg.readOnlyRoots.map((r) => canonicalize(r));
    const inRo = ro.some((r) => real === r || real.startsWith(r + path.sep));
    if (inRo) return false;
  }
  return true;
}

function looksLikePath(arg: string): boolean {
  if (/^https?:\/\//i.test(arg)) return false;
  return (
    arg.startsWith(".") ||
    arg.includes("/") ||
    /^(?:[A-Za-z]:[\\/]|\\\\)/.test(arg)
  );
}

function parseArgs(cmd: string): string[] {
  const out: string[] = [];
  let current = "";
  let single = false;
  let double = false;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (ch === "'" && !double) {
      single = !single;
      continue;
    }
    if (ch === '"' && !single) {
      double = !double;
      continue;
    }
    if (!single && !double && /\s/.test(ch)) {
      if (current) {
        out.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (single || double) throw new Error("unbalanced quotes");
  if (current) out.push(current);
  return out;
}

function splitPipeline(cmd: string): string[] {
  // Split on '|' outside quotes
  const out: string[] = [];
  let current = "";
  let single = false;
  let double = false;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (ch === "'" && !double) {
      single = !single;
      current += ch;
      continue;
    }
    if (ch === '"' && !single) {
      double = !double;
      current += ch;
      continue;
    }
    if (ch === "|" && !single && !double) {
      const seg = current.trim();
      if (seg) out.push(seg);
      current = "";
      continue;
    }
    current += ch;
  }
  const seg = current.trim();
  if (seg) out.push(seg);
  return out;
}

type SeqOp = "&&" | "||" | ";";
function splitSequence(cmd: string): Array<{ cmd: string; op: SeqOp | null }> {
  const out: Array<{ cmd: string; op: SeqOp | null }> = [];
  let current = "";
  let single = false;
  let double = false;
  let nextOp: SeqOp | null = null;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    const nxt = cmd[i + 1];
    if (ch === "'" && !double) {
      single = !single;
      current += ch;
      continue;
    }
    if (ch === '"' && !single) {
      double = !double;
      current += ch;
      continue;
    }
    if (!single && !double) {
      if (ch === ";") {
        const seg = current.trim();
        if (seg) out.push({ cmd: seg, op: nextOp });
        current = "";
        nextOp = ";";
        continue;
      }
      if (ch === "&" && nxt === "&") {
        const seg = current.trim();
        if (seg) out.push({ cmd: seg, op: nextOp });
        current = "";
        nextOp = "&&";
        i++;
        continue;
      }
      if (ch === "|" && nxt === "|") {
        const seg = current.trim();
        if (seg) out.push({ cmd: seg, op: nextOp });
        current = "";
        nextOp = "||";
        i++;
        continue;
      }
    }
    current += ch;
  }
  const tail = current.trim();
  if (tail) out.push({ cmd: tail, op: nextOp });
  return out;
}

function commandPolicyCheck(
  args: { command: string; cwd: string },
  cfg: TerminalToolConfig,
): { allowed: boolean; reason?: string } {
  if (!cfg.capabilities.exec)
    return { allowed: false, reason: "exec disabled" };
  if (!isPathAllowed(args.cwd, cfg, "exec"))
    return { allowed: false, reason: "cwd outside roots" };
  let parsed: string[];
  try {
    parsed = parseArgs(args.command);
  } catch {
    return { allowed: false, reason: "invalid quoting" };
  }
  if (parsed.length === 0) return { allowed: false, reason: "empty command" };
  // Detect shell/control operators; allow only configured ones
  const found: string[] = [];
  const cmdStr = args.command;
  if (/&&/.test(cmdStr)) found.push("&&");
  const hasOrOr = /\|\|/.test(cmdStr);
  if (hasOrOr) found.push("||");
  // Consider single '|' only after removing '||'
  if (/\|/.test(cmdStr.replace(/\|\|/g, ""))) found.push("|");
  if (/;/.test(cmdStr)) found.push(";");
  if (/\$\(/.test(cmdStr)) found.push("$(...)");
  if (/`/.test(cmdStr)) found.push("`...`");
  if (/>/.test(cmdStr)) found.push(">");
  if (/<<?/.test(cmdStr)) found.push("<");
  if (/(^|\s)&(\s|$)/.test(cmdStr)) found.push("&");
  const allowPipe = cfg.allowPipe ?? false;
  const allowSequence = cfg.allowSequence ?? false;
  const unallowed = found.filter((op) => {
    if (op === "|" && allowPipe) return false;
    if ((op === "&&" || op === "||" || op === ";") && allowSequence)
      return false;
    return true;
  });
  if (unallowed.length > 0) {
    const unique = Array.from(new Set(unallowed)).join(", ");
    return {
      allowed: false,
      reason: `shell operators not allowed (${unique}). Enable allowPipe and/or allowSequence in config to opt in.`,
    };
  }
  const [verb, ...rest] = parsed;
  if (!isCommandAllowed(verb, cfg.commands))
    return { allowed: false, reason: "command denied" };
  for (const a of rest) {
    if (looksLikePath(a)) {
      const abs =
        path.isAbsolute(a) || /^(?:[A-Za-z]:\\|\\)/.test(a)
          ? a
          : path.join(args.cwd, a);
      if (!isPathAllowed(abs, cfg, "read")) {
        return { allowed: false, reason: `path outside roots: ${a}` };
      }
    }
  }
  // If a pipeline is present and allowed, validate each segment
  if (allowPipe && /\|/.test(args.command)) {
    const segments = splitPipeline(args.command);
    if (segments.length < 2)
      return { allowed: false, reason: "invalid pipeline" };
    for (const seg of segments) {
      let segArgs: string[];
      try {
        segArgs = parseArgs(seg);
      } catch {
        return {
          allowed: false,
          reason: "invalid quoting in pipeline segment",
        };
      }
      if (segArgs.length === 0)
        return { allowed: false, reason: "empty pipeline segment" };
      const [v, ...r] = segArgs;
      if (!isCommandAllowed(v, cfg.commands))
        return { allowed: false, reason: `command denied in pipeline: ${v}` };
      for (const a of r) {
        if (looksLikePath(a)) {
          const abs =
            path.isAbsolute(a) || /^(?:[A-Za-z]:\\|\\)/.test(a)
              ? a
              : path.join(args.cwd, a);
          if (!isPathAllowed(abs, cfg, "read"))
            return {
              allowed: false,
              reason: `path outside roots in pipeline: ${a}`,
            };
        }
      }
    }
  }
  if (allowSequence && /(?:&&|\|\||;)/.test(args.command)) {
    const seq = splitSequence(args.command);
    if (seq.length === 0) return { allowed: false, reason: "invalid sequence" };
    for (const part of seq) {
      const res = commandPolicyCheck({ command: part.cmd, cwd: args.cwd }, cfg);
      if (!res.allowed) return res;
    }
  }
  return { allowed: true };
}

export function createTerminalTool(config?: Partial<TerminalToolConfig>) {
  const cfg: TerminalToolConfig = defaultTerminalConfig(config);

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

  function buildEnv(extra: Record<string, string>): Record<string, string> {
    const allowed = new Set(["PATH", "HOME", "LANG", "TERM"]);
    const env: Record<string, string> = {};
    for (const key of allowed) {
      const v = process.env[key];
      if (v !== undefined) env[key] = v;
    }
    for (const [k, v] of Object.entries(extra)) {
      if (allowed.has(k)) env[k] = v;
    }
    // Enforce a controlled PATH from config (ignores provided PATH to avoid hijack)
    env.PATH = cfg.execution.pathDirs.join(":");
    return env;
  }

  function start_session(args?: {
    cwd?: string;
    env?: Record<string, string>;
  }) {
    if (!cfg.sessions.enabled) throw new Error("sessions disabled");
    const cwd = canonicalize(args?.cwd ? path.resolve(args.cwd) : cfg.roots[0]);
    if (!isPathAllowed(cwd, cfg, "exec")) {
      throw new Error("cwd outside allowed roots");
    }
    const sessionId = randomUUID();
    const expiresAt = Date.now() + cfg.sessions.ttlMs;
    sessions.set(sessionId, { cwd, env: { ...(args?.env ?? {}) }, expiresAt });
    return { sessionId, expiresAt: new Date(expiresAt).toISOString() };
  }

  async function run_command(args: {
    command: string;
    cwd?: string;
    env?: Record<string, string>;
    stdin?: string;
    sessionId?: string;
  }): Promise<TerminalRunResult> {
    const session = getSession(args.sessionId);
    const cwd = canonicalize(
      path.resolve(args.cwd ?? session?.cwd ?? cfg.roots[0]),
    );
    const pre = commandPolicyCheck({ command: args.command, cwd }, cfg);
    if (!pre.allowed) {
      return {
        exitCode: -1,
        stdout: "",
        stderr: "",
        durationMs: 0,
        policy: {
          allowed: false,
          reason: pre.reason,
          allowedCommands: cfg.commands.allow,
        },
        message: `Command denied by policy. Allowed commands: ${cfg.commands.allow.join(", ")}.`,
        cwd,
      };
    }
    const pipelinesAllowed = cfg.allowPipe ?? false;
    const sequencesAllowed = cfg.allowSequence ?? false;
    const hasPipe = pipelinesAllowed && /\|/.test(args.command);
    const hasSeq = sequencesAllowed && /(?:&&|\|\||;)/.test(args.command);
    // Execute sequences (if enabled) without a shell by running segments serially
    if (hasSeq) {
      const seq = splitSequence(args.command);
      let lastExit = 0;
      let out = "";
      let err = "";
      let durTotal = 0;
      for (let i = 0; i < seq.length; i++) {
        const { cmd: subCmd, op } = seq[i];
        const shouldRun =
          i === 0
            ? true
            : op === ";"
              ? true
              : op === "&&"
                ? lastExit === 0
                : lastExit !== 0;
        if (!shouldRun) continue;
        const res = await run_command({ ...args, command: subCmd, cwd });
        out += res.stdout || "";
        err += res.stderr || "";
        durTotal += res.durationMs || 0;
        lastExit = res.exitCode;
      }
      if (session) {
        session.cwd = cwd;
        session.expiresAt = Date.now() + cfg.sessions.ttlMs;
      }
      return {
        exitCode: lastExit,
        stdout: out,
        stderr: err,
        durationMs: durTotal,
        policy: { allowed: true },
        cwd,
      };
    }
    const argv = parseArgs(args.command);
    const [cmd, ...cmdArgs] = argv;
    const env = buildEnv({ ...(session?.env ?? {}), ...(args.env ?? {}) });
    const start = Date.now();
    return await new Promise<TerminalRunResult>((resolve) => {
      let stdout = "",
        stderr = "";
      let outBytes = 0,
        errBytes = 0;
      const children: Array<import("node:child_process").ChildProcess> = [];
      const killAll = () => {
        for (const c of children) {
          try {
            c.kill("SIGKILL");
          } catch {
            // ignore kill errors
          }
        }
      };
      const onStdout = (d: Buffer) => {
        outBytes += d.length;
        if (outBytes <= cfg.execution.maxStdoutBytes) stdout += d.toString();
        else killAll();
      };
      const onStderr = (d: Buffer) => {
        errBytes += d.length;
        if (errBytes <= cfg.execution.maxStderrBytes) stderr += d.toString();
        else killAll();
      };
      const timeout = setTimeout(() => killAll(), cfg.execution.timeoutMs);

      if (hasPipe) {
        const segments = splitPipeline(args.command);
        const argvList = segments.map((seg) => parseArgs(seg));
        let prev: import("node:child_process").ChildProcess | undefined;
        let finished = false;
        const finish = (exitCode: number, errMsg?: string) => {
          if (finished) return;
          finished = true;
          clearTimeout(timeout);
          const dur = Date.now() - start;
          if (session) {
            session.cwd = cwd;
            session.expiresAt = Date.now() + cfg.sessions.ttlMs;
          }
          if (errMsg) {
            stderr += (stderr ? "\n" : "") + errMsg;
          }
          resolve({
            exitCode,
            stdout,
            stderr,
            durationMs: dur,
            policy: { allowed: true },
            cwd,
          });
        };
        for (let i = 0; i < argvList.length; i++) {
          const [pcmd, ...pargs] = argvList[i];
          const proc = spawn(pcmd, pargs, { cwd, env, shell: false });
          children.push(proc);
          proc.on("error", (err) => {
            killAll();
            finish(-1, String(err?.message ?? err));
          });
          if (i === 0) {
            if (args.stdin) proc.stdin.write(args.stdin);
          }
          if (prev && prev.stdout) {
            prev.stdout.pipe(proc.stdin);
          }
          if (i === argvList.length - 1 && proc.stdout) {
            proc.stdout.on("data", onStdout);
          }
          if (proc.stderr) proc.stderr.on("data", onStderr);
          // Close stdin of previous once piped
          if (prev && prev.stdin) {
            prev.stdin.end();
          }
          prev = proc;
        }
        const last = children[children.length - 1];
        last.on("close", (code) => finish(code ?? -1));
        last.on("error", (err) => finish(-1, String(err?.message ?? err)));
      } else {
        const child = spawn(cmd, cmdArgs, { cwd, env, shell: false });
        children.push(child);
        if (args.stdin) child.stdin.write(args.stdin);
        child.stdin.end();
        child.stdout.on("data", onStdout);
        child.stderr.on("data", onStderr);
        child.on("close", (code) => {
          clearTimeout(timeout);
          const dur = Date.now() - start;
          if (session) {
            session.cwd = cwd;
            session.expiresAt = Date.now() + cfg.sessions.ttlMs;
          }
          resolve({
            exitCode: code ?? -1,
            stdout,
            stderr,
            durationMs: dur,
            policy: { allowed: true },
            cwd,
          });
        });
        child.on("error", (err) => {
          clearTimeout(timeout);
          const dur = Date.now() - start;
          resolve({
            exitCode: -1,
            stdout,
            stderr: String(err.message),
            durationMs: dur,
            policy: { allowed: true },
            cwd,
          });
        });
      }
    });
  }

  function cd(args: { path: string; sessionId?: string }): {
    cwd: string;
    sessionId?: string;
  } {
    let session = getSession(args.sessionId);
    let createdSessionId: string | undefined;
    // If no valid session is provided, create one anchored at the first root
    if (!session) {
      const cwd = canonicalize(cfg.roots[0]);
      createdSessionId = randomUUID();
      const expiresAt = Date.now() + cfg.sessions.ttlMs;
      session = { cwd, env: {}, expiresAt };
      sessions.set(createdSessionId, session);
    }
    const newPath = canonicalize(path.resolve(session.cwd, args.path));
    if (!isPathAllowed(newPath, cfg, "exec")) {
      throw new Error("path outside allowed roots");
    }
    session.cwd = newPath;
    session.expiresAt = Date.now() + cfg.sessions.ttlMs;
    return {
      cwd: session.cwd,
      sessionId: createdSessionId ?? args.sessionId,
    };
  }

  async function read_file(args: {
    path: string;
    encoding?: "utf8" | "base64";
    sessionId?: string;
  }): Promise<TerminalReadResult> {
    if (!cfg.capabilities.read) throw new Error("read disabled");
    const session = getSession(args.sessionId);
    const cwd = session?.cwd ?? cfg.roots[0];
    const abs = canonicalize(path.resolve(cwd, args.path));
    if (!isPathAllowed(abs, cfg, "read")) {
      return {
        contents: "",
        policy: {
          allowed: false,
          reason: "path outside allowed roots",
          allowedRoots: cfg.roots,
        },
        message: `Path denied by policy. Allowed roots: ${cfg.roots.join(", ")}.`,
      };
    }
    const buf = await fs.readFile(abs);
    const encoding = args.encoding ?? "utf8";
    const contents =
      encoding === "base64" ? buf.toString("base64") : buf.toString("utf8");
    return { contents, policy: { allowed: true } };
  }

  const runCommandTool: Tool<
    {
      command: string;
      cwd?: string;
      env?: Record<string, string>;
      stdin?: string;
      sessionId?: string;
    },
    TerminalRunResult
  > = {
    name: "terminalRun",
    description: [
      `Run a non-interactive command within allowed roots (${cfg.roots}).`,
      `Use for listing files (ls), printing files (cat), simple text processing etc. Allowed commands are ${cfg.commands.allow.join(", ")}.`,
      "Shell operators are rejected and the environment is sanitized before execution.",
      "Always prefer passing a safe single command.",
      "Tips: pass cwd to run in a specific folder; use terminalCd first to set a working directory for subsequent calls; prefer terminalReadFile when you only need file contents.",
    ].join(" "),
    schema: z.object({
      command: z.string(),
      cwd: z.string().optional(),
      env: z.record(z.string()).optional(),
      stdin: z.string().optional(),
      sessionId: z.string().optional(),
    }),
    handler: async (a, ctx: ToolContext) => {
      const s = getSession(a.sessionId);
      const effCwd = path.resolve(a.cwd ?? s?.cwd ?? cfg.roots[0]);
      const policy = commandPolicyCheck(
        { command: a.command, cwd: effCwd },
        cfg,
      );
      ctx?.log?.debug?.("[terminalRun] policy", {
        command: a.command,
        cwd: effCwd,
        policy,
      });
      const res = await run_command(a);
      ctx?.log?.info?.("[terminalRun] result", {
        command: a.command,
        cwd: res.cwd,
        exitCode: res.exitCode,
        durationMs: res.durationMs,
        stdoutBytes: Buffer.byteLength(res.stdout || ""),
        stderrBytes: Buffer.byteLength(res.stderr || ""),
        policy: res.policy,
      });
      return res;
    },
  };

  const cdTool: Tool<
    { path: string; sessionId?: string },
    { cwd: string; sessionId?: string }
  > = {
    name: "terminalCd",
    description: [
      "Change the working directory for subsequent terminal operations.",
      "Accepts a path relative to the current directory or absolute within the configured roots.",
      "If no session exists, creates one and returns sessionId.",
      "Use before terminalRun when you need to run multiple commands in the same folder.",
    ].join(" "),
    schema: z.object({ path: z.string(), sessionId: z.string().optional() }),
    handler: async ({ path: relPath, sessionId }, ctx: ToolContext) => {
      const s = getSession(sessionId);
      const base = s?.cwd ?? cfg.roots[0];
      const target = path.resolve(base, relPath);
      const allowed = isPathAllowed(target, cfg, "exec");
      ctx?.log?.debug?.("[terminalCd] request", {
        base,
        path: relPath,
        target,
        allowed,
      });
      const res = cd({ path: relPath, sessionId });
      ctx?.log?.info?.("[terminalCd] result", res);
      return res;
    },
  };

  const readFileTool: Tool<
    { path: string; encoding?: "utf8" | "base64"; sessionId?: string },
    TerminalReadResult
  > = {
    name: "terminalReadFile",
    description: [
      "Read a small text file from the sandboxed workspace.",
      "Prefer this instead of running `cat` when you only need file contents.",
      "Path must be inside allowed roots; returns UTF-8 text by default.",
    ].join(" "),
    schema: z.object({
      path: z.string(),
      encoding: z.enum(["utf8", "base64"]).optional(),
      sessionId: z.string().optional(),
    }),
    handler: async (a, ctx: ToolContext) => {
      const s = getSession(a.sessionId);
      const base = s?.cwd ?? cfg.roots[0];
      const abs = path.resolve(base, a.path);
      const allowed = isPathAllowed(abs, cfg, "read");
      ctx?.log?.debug?.("[terminalReadFile] request", {
        base,
        path: a.path,
        abs,
        allowed,
      });
      const res = await read_file(a);
      ctx?.log?.info?.("[terminalReadFile] result", {
        abs,
        bytes: Buffer.byteLength(res.contents || ""),
        encoding: a.encoding || "utf8",
      });
      return res;
    },
  };

  // Do not expose start_session as a tool by default to keep the model API simple.
  return {
    start_session,
    run_command,
    cd,
    read_file,
    tools: [runCommandTool, cdTool, readFileTool],
  };
}

export type TerminalTool = ReturnType<typeof createTerminalTool>;
