import { describe, it, expect } from 'vitest'
import { parseFrontmatter } from '../src/parser'

describe('parser', () => {
  it('parses simple frontmatter', () => {
    const md = `---
name: test-skill
description: A skill
---
# Body`
    const p = parseFrontmatter(md)
    expect((p.metadata as any).name).toBe('test-skill')
    expect((p.metadata as any).description).toBe('A skill')
    expect(p.body.startsWith('# Body')).toBe(true)
  })
  it('parses inline array', () => {
    const md = `---
tags: [one, two]
---
body`
    const p = parseFrontmatter(md)
    expect(Array.isArray((p.metadata as any).tags)).toBe(true)
    expect(((p.metadata as any).tags as string[])[0]).toBe('one')
  })
})
