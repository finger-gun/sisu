import type { Tool, ToolContext } from "@sisu-ai/core";
import { z } from "zod";
import { Skill } from "./types";

export function createUseSkillTool(skills: Map<string, Skill>): Tool {
  return {
    name: "use_skill",
    description: "Activate a skill to load its full instructions and resources",
    schema: z.object({ skill_name: z.string() }),
    handler: async (args: { skill_name: string }, _ctx: ToolContext) => {
      const skill = skills.get(args.skill_name);
      if (!skill) return `Skill \"${args.skill_name}\" not found.`;

      const resources = skill.resources.map((r) => `- ${r.path}`).join("\n");
      const list = resources || "- (none)";
      return `Skill: ${skill.metadata.name}\nSkill directory: ${skill.directory}\n\n${skill.instructions}\n\nAvailable resources (relative to skill directory):\n${list}`;
    },
  };
}

export default createUseSkillTool;
