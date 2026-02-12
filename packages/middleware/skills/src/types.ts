export interface SkillMetadata {
  name: string;
  description: string;
  version?: string;
  author?: string;
  tags?: string[];
  requires?: string[];
}

export interface SkillResource {
  name: string;
  path: string; // relative path within skill dir
  absolutePath: string;
  type: "script" | "template" | "reference" | "other";
}

export interface Skill {
  metadata: SkillMetadata;
  instructions: string; // markdown body after frontmatter
  path: string; // absolute path to SKILL.md
  directory: string; // skill directory
  resources: SkillResource[];
}

export interface SkillsOptions {
  directories?: string[];
  directory?: string;
  cwd?: string;
  maxFileSize?: number;
  maxSkillSize?: number;
  cacheTtl?: number;
  include?: string[];
  exclude?: string[];
}

export interface SkillDiscoveryResult {
  skills: Skill[];
  scannedDirectories: string[];
  errors: Array<{ path: string; error: string }>;
}
