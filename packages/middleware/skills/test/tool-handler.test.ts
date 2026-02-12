import { describe, it, expect } from "vitest";
import { createUseSkillTool } from "../src/tool-handler";
import type { Skill } from "../src/types";

describe("createUseSkillTool", () => {
  it("returns instructions and resources", async () => {
    const skill: Skill = {
      metadata: { name: "deploy", description: "Deploy app" },
      instructions: "# Deploy\nRun checks",
      path: "/abs/skill/SKILL.md",
      directory: "/abs/skill",
      resources: [
        {
          name: "deploy.sh",
          path: "deploy.sh",
          absolutePath: "/abs/skill/deploy.sh",
          type: "script",
        },
      ],
    };
    const map = new Map<string, Skill>([["deploy", skill]]);
    const tool = createUseSkillTool(map);

    const out = await tool.handler({ skill_name: "deploy" }, {} as any);
    expect(out).toContain("Skill: deploy");
    expect(out).toContain("# Deploy");
    expect(out).toContain("- deploy.sh");
  });

  it("handles missing skills", async () => {
    const tool = createUseSkillTool(new Map());
    const out = await tool.handler({ skill_name: "missing" }, {} as any);
    expect(out).toContain("not found");
  });
});
