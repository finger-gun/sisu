/**
 * Minimal frontmatter parser for SKILL.md files.
 * Supports simple key: value pairs and arrays (inline and multiline lists).
 */

export interface ParsedFrontmatter {
  metadata: Record<string, unknown>;
  body: string;
}

export function parseFrontmatter(content: string): ParsedFrontmatter {
  const regex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const m = content.match(regex);
  if (!m) {
    return { metadata: {}, body: content };
  }

  const [, yamlContent, body] = m;
  const metadata = parseSimpleYaml(yamlContent);
  return { metadata, body: body.trim() };
}

function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const res: Record<string, unknown> = {};
  const lines = yaml.split(/\r?\n/);
  let currentKey: string | null = null;
  let currentArray: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    if (line.startsWith("-") && currentKey) {
      currentArray.push(line.replace(/^-\s*/, "").trim());
      continue;
    }

    // flush array if switching keys
    if (currentKey && currentArray.length > 0) {
      res[currentKey] = currentArray;
      currentArray = [];
      currentKey = null;
    }

    const idx = raw.indexOf(":");
    if (idx === -1) continue;
    const key = raw.slice(0, idx).trim();
    let value = raw.slice(idx + 1).trim();
    if (!value) {
      currentKey = key;
      currentArray = [];
      continue;
    }

    // inline array
    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      res[key] = inner;
      continue;
    }

    // strip quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    res[key] = value;
  }

  if (currentKey && currentArray.length > 0) {
    res[currentKey] = currentArray;
  }

  return res;
}

export default parseFrontmatter;
