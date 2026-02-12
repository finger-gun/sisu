import * as fs from "fs/promises";
import * as path from "path";
import {
  SkillsOptions,
  Skill,
  SkillResource,
  SkillDiscoveryResult,
} from "./types.js";
import parseFrontmatter from "./parser.js";
import { SkillMetadataSchema } from "./schemas.js";

const DEFAULT_MAX_FILE_SIZE = 100 * 1024; // 100KB
const DEFAULT_MAX_SKILL_SIZE = 500 * 1024; // 500KB

function classifyResource(name: string): SkillResource["type"] {
  const ext = path.extname(name).toLowerCase();
  if ([".sh", ".bash"].includes(ext)) return "script";
  if ([".yml", ".yaml", ".json", ".template"].includes(ext)) return "template";
  if ([".md", ".txt"].includes(ext)) return "reference";
  return "other";
}

function toPosixPath(p: string): string {
  return p.split(path.sep).join("/");
}

async function collectResources(
  skillDir: string,
  dir: string,
  resources: SkillResource[],
  maxFileSize: number,
  maxSkillSize: number,
  sizeTracker: { total: number; exceeded: boolean },
  errors: SkillDiscoveryResult["errors"],
): Promise<void> {
  const entries = await fs
    .readdir(dir, { withFileTypes: true })
    .catch(() => []);
  for (const entry of entries) {
    if (sizeTracker.exceeded) return;
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectResources(
        skillDir,
        fp,
        resources,
        maxFileSize,
        maxSkillSize,
        sizeTracker,
        errors,
      );
      continue;
    }

    if (!entry.isFile()) continue;
    if (entry.name === "SKILL.md") continue;

    const st = await fs.stat(fp).catch(() => null);
    if (!st || !st.isFile()) continue;
    if (st.size > maxFileSize) {
      errors.push({
        path: fp,
        error: `Resource too large (${st.size} bytes)`,
      });
      continue;
    }

    sizeTracker.total += st.size;
    if (sizeTracker.total > maxSkillSize) {
      sizeTracker.exceeded = true;
      return;
    }

    const rel = toPosixPath(path.relative(skillDir, fp));
    resources.push({
      name: entry.name,
      path: rel,
      absolutePath: fp,
      type: classifyResource(entry.name),
    });
  }
}

async function loadSkillFromDir(
  skillDir: string,
  options: SkillsOptions,
  errors: SkillDiscoveryResult["errors"],
): Promise<Skill | null> {
  const skillPath = path.join(skillDir, "SKILL.md");
  const skillStatFile = await fs.stat(skillPath).catch(() => null);
  if (!skillStatFile || !skillStatFile.isFile()) return null;

  const raw = await fs.readFile(skillPath, "utf-8").catch(() => null);
  if (raw === null) {
    errors.push({ path: skillPath, error: "Failed to read SKILL.md" });
    return null;
  }

  const { metadata, body } = parseFrontmatter(raw);
  const parsed = SkillMetadataSchema.safeParse(metadata);
  if (!parsed.success) {
    errors.push({
      path: skillPath,
      error: `Invalid skill metadata: ${parsed.error.message}`,
    });
    return null;
  }

  const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  const maxSkillSize = options.maxSkillSize ?? DEFAULT_MAX_SKILL_SIZE;

  const resources = [] as SkillResource[];
  const sizeTracker = { total: skillStatFile.size, exceeded: false };
  await collectResources(
    skillDir,
    skillDir,
    resources,
    maxFileSize,
    maxSkillSize,
    sizeTracker,
    errors,
  );

  if (sizeTracker.exceeded) {
    errors.push({
      path: skillDir,
      error: `Skill too large (${sizeTracker.total} bytes)`,
    });
    return null;
  }

  const skill: Skill = {
    metadata: parsed.data,
    instructions: body,
    path: skillPath,
    directory: skillDir,
    resources,
  };

  const nameField = skill.metadata.name as string;
  if (options.include && options.include.length > 0) {
    if (!options.include.includes(nameField)) return null;
  }
  if (options.exclude && options.exclude.length > 0) {
    if (options.exclude.includes(nameField)) return null;
  }

  return skill;
}

export async function discoverSkills(
  options: SkillsOptions,
): Promise<SkillDiscoveryResult> {
  if (!options.directories && !options.directory) {
    throw new Error(
      "skills discovery requires explicit directory configuration",
    );
  }
  const dirs: string[] = [];
  if (options.directory) dirs.push(options.directory);
  if (Array.isArray(options.directories)) dirs.push(...options.directories);
  const cwd = options.cwd || process.cwd();
  const absDirs = dirs.map((d) => (path.isAbsolute(d) ? d : path.join(cwd, d)));

  const result: Skill[] = [];
  const errors: SkillDiscoveryResult["errors"] = [];

  for (const dir of absDirs) {
    try {
      const stat = await fs.stat(dir).catch(() => null);
      if (!stat || !stat.isDirectory()) {
        errors.push({ path: dir, error: "Directory not found" });
        continue;
      }

      const directSkill = await loadSkillFromDir(dir, options, errors);
      if (directSkill) {
        result.push(directSkill);
        continue;
      }

      // list entries
      const names = await fs.readdir(dir);
      for (const name of names) {
        const skillDir = path.join(dir, name);
        const skillStat = await fs.stat(skillDir).catch(() => null);
        if (!skillStat || !skillStat.isDirectory()) continue;
        const skill = await loadSkillFromDir(skillDir, options, errors);
        if (skill) result.push(skill);
      }
    } catch (err) {
      errors.push({ path: dir, error: String(err) });
    }
  }

  return { skills: result, scannedDirectories: absDirs, errors };
}

export default discoverSkills;
