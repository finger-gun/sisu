import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { discoverSkills } from "../src/discover.js";

function writeSkill(dir: string, name: string, content: string) {
  const skillDir = path.join(dir, name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), content, "utf8");
  return skillDir;
}

describe("discoverSkills", () => {
  it("requires explicit directories", async () => {
    await expect(discoverSkills({} as any)).rejects.toThrow(
      /explicit directory configuration/,
    );
  });

  it("discovers skills and resources", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "skills-"));
    try {
      const skillDir = writeSkill(
        root,
        "deploy",
        `---\nname: deploy\ndescription: Deploy app\n---\n# Deploy\n`,
      );
      fs.mkdirSync(path.join(skillDir, "scripts"));
      fs.writeFileSync(
        path.join(skillDir, "scripts", "deploy.sh"),
        "echo",
        "utf8",
      );

      const res = await discoverSkills({ directory: root });
      expect(res.skills.length).toBe(1);
      expect(res.skills[0].metadata.name).toBe("deploy");
      expect(
        res.skills[0].resources.some((r) => r.path === "scripts/deploy.sh"),
      ).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("supports directory pointing to a skill folder", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "skills-"));
    try {
      const skillDir = path.join(root, "deploy");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, "SKILL.md"),
        `---\nname: deploy\ndescription: Deploy app\n---\n# Deploy\n`,
        "utf8",
      );

      const res = await discoverSkills({ directory: skillDir });
      expect(res.skills.length).toBe(1);
      expect(res.skills[0].metadata.name).toBe("deploy");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("applies include/exclude filters", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "skills-"));
    try {
      writeSkill(root, "one", `---\nname: one\ndescription: One\n---\n# One\n`);
      writeSkill(root, "two", `---\nname: two\ndescription: Two\n---\n# Two\n`);

      const res = await discoverSkills({ directory: root, include: ["one"] });
      expect(res.skills.length).toBe(1);
      expect(res.skills[0].metadata.name).toBe("one");

      const res2 = await discoverSkills({ directory: root, exclude: ["one"] });
      expect(res2.skills.length).toBe(1);
      expect(res2.skills[0].metadata.name).toBe("two");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
