import { SkillsOptions } from "./types";
import discoverSkills from "./discover";
import createUseSkillTool from "./tool-handler";

export function skillsMiddleware(options: SkillsOptions) {
  return async (ctx: any, next: any) => {
    if (!options.directories && !options.directory) {
      throw new Error(
        "skills middleware requires explicit directory configuration",
      );
    }

    if (!ctx.state) ctx.state = {};
    if (!ctx.state.skills) {
      const skills = await discoverSkills(options);
      // create map by name for quick lookup
      const map = new Map<string, any>();
      for (const s of skills) map.set((s.metadata as any).name, s);
      ctx.state.skills = skills;
      ctx.state.skillsMap = map;
    }

    // register tool
    const tool = createUseSkillTool(ctx.state.skillsMap);
    if (!ctx.tools) ctx.tools = [];
    ctx.tools.push(tool as any);

    // inject metadata into system prompt
    if (!ctx.systemPrompt) ctx.systemPrompt = "";
    if (ctx.state.skills.length > 0) {
      const skillsList = ctx.state.skills
        .map((s: any) => `  - "${s.metadata.name}": ${s.metadata.description}`)
        .join("\n");
      ctx.systemPrompt += `\n\nSKILLS\n\nAvailable skills:\n${skillsList}\n\nTo use a skill, call the use_skill tool with the skill name.`;
    }

    await next();
  };
}

export default skillsMiddleware;
