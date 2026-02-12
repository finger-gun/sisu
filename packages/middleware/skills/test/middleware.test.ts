import { describe, it, expect } from "vitest";
import type { Ctx, Tool } from "@sisu-ai/core";
import { InMemoryKV, NullStream, SimpleTools, compose } from "@sisu-ai/core";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { skillsMiddleware } from "../src/index.js";

function makeCtx(): Ctx {
  const ac = new AbortController();
  return {
    input: "",
    messages: [{ role: "system", content: "Base" }],
    model: {
      name: "dummy",
      capabilities: { functionCall: true },
      generate: async () =>
        ({ message: { role: "assistant", content: "ok" } }) as any,
    } as any,
    tools: new SimpleTools(),
    memory: new InMemoryKV(),
    stream: new NullStream(),
    state: {},
    signal: ac.signal,
    log: { debug() {}, info() {}, warn() {}, error() {}, span() {} },
  };
}

describe("skillsMiddleware", () => {
  it("registers use_skill and injects metadata", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "skills-"));
    try {
      const skillDir = path.join(root, "deploy");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, "SKILL.md"),
        `---\nname: deploy\ndescription: Deploy app\n---\n# Deploy\n`,
        "utf8",
      );

      const ctx = makeCtx();
      await compose([skillsMiddleware({ directory: root })])(ctx);

      const tool = ctx.tools.get("use_skill") as Tool | undefined;
      expect(tool).toBeTruthy();

      const sys = ctx.messages[0];
      expect(sys.role).toBe("system");
      expect(sys.content).toContain("Available skills");
      expect(sys.content).toContain("deploy");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
