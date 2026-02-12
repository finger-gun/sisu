import type { Ctx, Middleware, Tool } from "@sisu-ai/core";
import type { Skill } from "./types";
import { SkillsOptions } from "./types";
import discoverSkills from "./discover";
import createUseSkillTool from "./tool-handler";

const STATE_KEY = "skills";

type SkillsState = {
  skills: Skill[];
  skillsMap: Map<string, Skill>;
  injected?: boolean;
  registered?: boolean;
};

export function skillsMiddleware(options: SkillsOptions): Middleware {
  return async (ctx: Ctx, next: () => Promise<void>) => {
    if (!options.directories && !options.directory) {
      throw new Error(
        "skills middleware requires explicit directory configuration",
      );
    }

    const state = ctx.state[STATE_KEY] as SkillsState | undefined;
    if (!state) {
      const { skills, errors } = await discoverSkills(options);
      for (const err of errors) {
        ctx.log.warn?.("[skills] discovery error", err);
      }
      const map = new Map<string, Skill>();
      for (const s of skills) map.set(s.metadata.name, s);
      ctx.state[STATE_KEY] = { skills, skillsMap: map } as SkillsState;
    }
    const skillsState = ctx.state[STATE_KEY] as SkillsState;

    // register tool
    if (!skillsState.registered && !ctx.tools.get("use_skill")) {
      const tool = createUseSkillTool(skillsState.skillsMap);
      ctx.tools.register(tool as Tool);
      skillsState.registered = true;
    }

    // inject metadata into system prompt
    const skills = skillsState.skills;
    if (!skillsState.injected && skills.length > 0) {
      const skillsList = skills
        .map((s) => `  - "${s.metadata.name}": ${s.metadata.description}`)
        .join("\n");

      const prompt = `\n\nSKILLS\n\nAvailable skills:\n${skillsList}\n\nTo use a skill, call the use_skill tool with the skill name.`;
      const first = ctx.messages[0];
      if (first && first.role === "system") {
        first.content = `${first.content}${prompt}`;
      } else {
        ctx.messages.unshift({ role: "system", content: prompt } as any);
      }
      skillsState.injected = true;
    }

    await next();
  };
}

export default skillsMiddleware;

export { discoverSkills } from "./discover";
export { createUseSkillTool } from "./tool-handler";
export { parseFrontmatter } from "./parser";
export * from "./types";
export { SkillMetadataSchema } from "./schemas";
