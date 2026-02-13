import type { Tool, ToolContext } from "@sisu-ai/core";
import { z } from "zod";
import { Skill, SkillResource } from "./types.js";

const useSkillSchema = z.object({ skill_name: z.string() });

export function createUseSkillTool(
  skills: Map<string, Skill>,
): Tool<z.infer<typeof useSkillSchema>, string> {
  return {
    name: "use_skill",
    description: "Activate a skill to load its full instructions and resources",
    schema: useSkillSchema,
    handler: async (args, _ctx: ToolContext) => {
      const skill = skills.get(args.skill_name);
      if (!skill) return `Skill "${args.skill_name}" not found.`;

      const resources = skill.resources
        .map((r: SkillResource) => `- ${r.path}`)
        .join("\n");
      const list = resources || "- (none)";
      return `Skill: ${skill.metadata.name}\nSkill directory: ${skill.directory}\n\n${skill.instructions}\n\nAvailable resources (relative to skill directory):\n${list}`;
    },
  };
}

export default createUseSkillTool;
