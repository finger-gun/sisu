import { z } from "zod";
import { Skill } from "./types";

export function createUseSkillTool(skills: Map<string, Skill>) {
  return {
    name: "use_skill",
    description: "Activate a skill to load its full instructions and resources",
    schema: z.object({ skill_name: z.string() }),
    handler: async (_ctx: unknown, args: { skill_name: string }) => {
      const skill = skills.get(args.skill_name);
      if (!skill) return `Skill \"${args.skill_name}\" not found.`;

      const resources = skill.resources.map((r) => `- ${r.path}`).join("\n");
      return `Skill: ${skill.metadata.name}\n\n${skill.instructions}\n\nAvailable resources:\n${resources}`;
    },
  };
}

export default createUseSkillTool;
