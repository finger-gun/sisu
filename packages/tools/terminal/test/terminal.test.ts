import { test, expect, vi } from "vitest";
import { createTerminalTool } from "../src/index.js";

const root = process.cwd();

const tool = createTerminalTool({ roots: [root] });

test("run_command executes allowed command", async () => {
  const res = await tool.run_command({ command: "pwd" });
  expect(res.policy.allowed).toBe(true);
  expect(res.stdout.trim()).toBe(root);
});

test("run_command blocks operators", async () => {
  const res = await tool.run_command({ command: "ls && whoami" });
  expect(res.policy.allowed).toBe(false);
  expect((res as any).message).toContain("Allowed commands");
});

test("run_command denies invalid quoting", async () => {
  const res = await tool.run_command({ command: "echo 'oops" });
  expect(res.policy.allowed).toBe(false);
  expect(res.policy.reason).toContain("invalid quoting");
});

test("run_command blocks path outside roots", async () => {
  const res = await tool.run_command({ command: "cat /etc/passwd" });
  expect(res.policy.allowed).toBe(false);
  expect((res as any).policy.allowedCommands.length).toBeGreaterThan(0);
});

test("pipeline with pipe is allowed when enabled and uses only allowed verbs", async () => {
  const toolWithPipe = createTerminalTool({ roots: [root], allowPipe: true });
  const res = await toolWithPipe.run_command({
    command: "cat README.md | wc -l",
  });
  expect(res.policy.allowed).toBe(true);
  expect(res.exitCode).toBe(0);
  expect(Number.isNaN(Number(res.stdout.trim()))).toBe(false);
});

test("sequence operators allowed when enabled: || runs fallback on error", async () => {
  const toolWithSeq = createTerminalTool({
    roots: [root],
    allowSequence: true,
  });
  const res = await toolWithSeq.run_command({
    command: "ls __definitely_missing__ || pwd",
  });
  expect(res.policy.allowed).toBe(true);
  // Final exit code should be that of pwd (0)
  expect(res.exitCode).toBe(0);
  expect(res.stdout.trim()).toBe(root);
});

test("run_command denies network tools like curl", async () => {
  const res = await tool.run_command({ command: "curl https://example.com" });
  expect(res.policy.allowed).toBe(false);
});

test("read_file refuses outside roots", async () => {
  const res = await tool.read_file({ path: "/etc/passwd" });
  expect((res as any).policy.allowed).toBe(false);
  expect((res as any).message).toContain("Allowed roots");
});

test("cd cannot escape root", async () => {
  const { sessionId } = tool.start_session({ cwd: root });
  expect(() => tool.cd({ sessionId, path: ".." })).toThrow();
});

test("start_session fails when sessions disabled", () => {
  const t = createTerminalTool({
    roots: [root],
    sessions: { enabled: false, ttlMs: 1, maxPerAgent: 1 },
  });
  expect(() => t.start_session({ cwd: root })).toThrow(/sessions disabled/);
});

test("read_file throws when read capability disabled", async () => {
  const t = createTerminalTool({
    roots: [root],
    capabilities: { read: false, write: false, delete: false, exec: true },
  });
  await expect(t.read_file({ path: "README.md" })).rejects.toThrow(
    /read disabled/,
  );
});

test("run_command returns error on spawn failure", async () => {
  const t = createTerminalTool({
    roots: [root],
    commands: { allow: ["__nope__"] },
  });
  const res = await t.run_command({ command: "__nope__" });
  expect(res.exitCode).toBe(-1);
  expect(res.stderr.length).toBeGreaterThan(0);
});

test("read_file returns base64 contents", async () => {
  const res = await tool.read_file({ path: "README.md", encoding: "base64" });
  expect(res.policy.allowed).toBe(true);
  const decoded = Buffer.from(res.contents, "base64").toString("utf8");
  expect(decoded.length).toBeGreaterThan(0);
});

test("run_command uses session cwd", async () => {
  const { sessionId } = tool.start_session({ cwd: root });
  const res = await tool.run_command({ command: "pwd", sessionId });
  expect(res.policy.allowed).toBe(true);
  expect(res.stdout.trim()).toBe(root);
});

test("sequence operators denied when disallowed", async () => {
  const res = await tool.run_command({ command: "pwd; pwd" });
  expect(res.policy.allowed).toBe(false);
});

test("run_command logs policy and results", async () => {
  const t = createTerminalTool({ roots: [root] });
  const debug = vi.fn();
  const info = vi.fn();
  const handler = t.tools.find((x) => x.name === "terminalRun");
  const res = await handler!.handler({ command: "pwd" }, {
    log: { debug, info },
  } as any);
  expect(res.exitCode).toBe(0);
  expect(debug).toHaveBeenCalled();
  expect(info).toHaveBeenCalled();
});

test("terminalCd creates session when missing", async () => {
  const t = createTerminalTool({ roots: [root] });
  const handler = t.tools.find((x) => x.name === "terminalCd");
  const res = await handler!.handler({ path: "." }, {
    log: { debug: vi.fn(), info: vi.fn() },
  } as any);
  expect(res.sessionId).toBeTruthy();
});
