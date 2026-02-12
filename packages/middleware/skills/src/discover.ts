import * as fs from "fs/promises";
import * as path from "path";
import {
  SkillsOptions,
  Skill,
  SkillResource,
  SkillDiscoveryResult,
} from "./types";
import parseFrontmatter from "./parser";
import { SkillMetadataSchema } from "./schemas";

const DEFAULT_MAX_FILE_SIZE = 100 * 1024; // 100KB

function classifyResource(name: string): SkillResource["type"] {
  const ext = path.extname(name).toLowerCase();
  if ([".sh", ".bash"].includes(ext)) return "script";
  if ([".yml", ".yaml", ".json", ".template"].includes(ext)) return "template";
  if ([".md", ".txt"].includes(ext)) return "reference";
  return "other";
}

export async function discoverSkills(options: SkillsOptions): Promise<Skill[]> {
  const dirs: string[] = [];
  if (options.directory) dirs.push(options.directory);
  if (Array.isArray(options.directories)) dirs.push(...options.directories);
  const cwd = options.cwd || process.cwd();
  const absDirs = dirs.map((d) => (path.isAbsolute(d) ? d : path.join(cwd, d)));

  const result: Skill[] = [];

  const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;

  for (const dir of absDirs) {
    try {
      const stat = await fs.stat(dir).catch(() => null);
      if (!stat || !stat.isDirectory()) continue;

      // list entries
      const names = await fs.readdir(dir);
      for (const name of names) {
        const skillDir = path.join(dir, name);
        const skillStat = await fs.stat(skillDir).catch(() => null);
        if (!skillStat || !skillStat.isDirectory()) continue;

        const skillPath = path.join(skillDir, "SKILL.md");
        const exists = await fs.stat(skillPath).catch(() => null);
        if (!exists || !exists.isFile()) continue;

        const raw = await fs.readFile(skillPath, "utf-8").catch(() => null);
        if (raw === null) continue;

        const { metadata, body } = parseFrontmatter(raw);
        const parsed = SkillMetadataSchema.safeParse(metadata);
        if (!parsed.success) {
          // skip invalid metadata
          // eslint-disable-next-line no-console
          console.warn(
            `Invalid skill metadata in ${skillPath}: ${parsed.error.message}`,
          );
          continue;
        }

        const files = await fs.readdir(skillDir).catch(() => []);
        const resources = [] as SkillResource[];
        for (const f of files) {
          if (f === "SKILL.md") continue;
          const fp = path.join(skillDir, f);
          const st = await fs.stat(fp).catch(() => null);
          if (!st || !st.isFile()) continue;
          if (st.size > maxFileSize) {
            // skip oversized resource
            // eslint-disable-next-line no-console
            console.warn(
              `Skipping resource ${fp}: file too large (${st.size} bytes)`,
            );
            continue;
          }
          resources.push({
            name: f,
            path: f,
            absolutePath: fp,
            type: classifyResource(f),
          });
        }

        const skill: Skill = {
          metadata: parsed.data,
          instructions: body,
          path: skillPath,
          directory: skillDir,
          resources,
        };

        // apply include/exclude filters
        const nameField = skill.metadata.name as string;
        if (options.include && options.include.length > 0) {
          if (!options.include.includes(nameField)) continue;
        }
        if (options.exclude && options.exclude.length > 0) {
          if (options.exclude.includes(nameField)) continue;
        }

        result.push(skill);
      }
    } catch (err) {
      // ignore directory-level errors
      // eslint-disable-next-line no-console
      console.warn(`Failed scanning directory ${dir}: ${String(err)}`);
    }
  }

  return result;
}

export default discoverSkills;
