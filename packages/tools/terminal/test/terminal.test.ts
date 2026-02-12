import { test, expect } from "vitest";
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
