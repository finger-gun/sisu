import { describe, it, expect } from "vitest";
import { parseFrontmatter } from "../src/parser";

describe("parser", () => {
  it("parses simple frontmatter", () => {
    const md = `---
name: test-skill
description: A skill
---
# Body`;
    const p = parseFrontmatter(md);
    const meta = p.metadata as Record<string, unknown>;
    expect(meta.name).toBe("test-skill");
    expect(meta.description).toBe("A skill");
    expect(p.body.startsWith("# Body")).toBe(true);
  });
  it("parses inline array", () => {
    const md = `---
tags: [one, two]
---
body`;
    const p = parseFrontmatter(md);
    const meta = p.metadata as Record<string, unknown>;
    expect(Array.isArray(meta.tags)).toBe(true);
    expect((meta.tags as string[])[0]).toBe("one");
  });
  it("parses multiline arrays", () => {
    const md = `---
tags:
  - one
  - two
---
body`;
    const p = parseFrontmatter(md);
    const meta = p.metadata as Record<string, unknown>;
    expect(meta.tags).toEqual(["one", "two"]);
  });
});
