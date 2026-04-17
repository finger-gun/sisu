import { describe, expect, test } from 'vitest';
import { renderMarkdownLines } from '../src/chat/markdown.js';

describe('markdown rendering', () => {
  test('returns empty array for blank markdown', () => {
    expect(renderMarkdownLines('   \n  ')).toEqual([]);
  });

  test('normalizes inline emphasis and links in plain text and lists', () => {
    const rendered = renderMarkdownLines([
      'Visit [Docs](https://example.com) with **bold** and _emphasis_.',
      '- Item with __strong__ text',
      '1. Ordered with *italic* text',
    ].join('\n'));

    const text = rendered.map((line) => line.text).join('\n');
    expect(text).toContain('Visit Docs (https://example.com) with bold and emphasis.');
    expect(text).toContain('• Item with strong text');
    expect(text).toContain('1. Ordered with italic text');
  });

  test('renders headings, quotes, and horizontal rules', () => {
    const rendered = renderMarkdownLines([
      '## Heading',
      '> quoted **line**',
      '---',
    ].join('\n'));

    expect(rendered[0]).toEqual({ text: 'Heading', tone: 'info' });
    expect(rendered.some((line) => line.text === '│ quoted line' && line.tone === 'muted')).toBe(true);
    expect(rendered.some((line) => line.text.includes('────────────────') && line.tone === 'muted')).toBe(true);
  });

  test('renders fenced code blocks as muted and preserves content spacing', () => {
    const rendered = renderMarkdownLines([
      '```ts',
      'const x = 1;',
      '\tconst y = 2;',
      '```',
    ].join('\n'));

    expect(rendered[0]).toEqual({ text: '```', tone: 'muted' });
    expect(rendered[1]).toEqual({ text: '  const x = 1;', tone: 'muted' });
    expect(rendered[2]).toEqual({ text: '    const y = 2;', tone: 'muted' });
    expect(rendered[3]).toEqual({ text: '```', tone: 'muted' });
  });

  test('coalesces consecutive blank lines to a single empty rendered line', () => {
    const rendered = renderMarkdownLines('line one\n\n\nline two');
    const blanks = rendered.filter((line) => line.text === '');
    expect(blanks).toHaveLength(1);
  });

  test('treats invalid table separators as plain text', () => {
    const rendered = renderMarkdownLines([
      '| A | B |',
      '| -- | nope |',
      '| 1 | 2 |',
    ].join('\n'));

    const text = rendered.map((line) => line.text).join('\n');
    expect(text).toContain('| A | B |');
    expect(text).toContain('| -- | nope |');
    expect(text).toContain('| 1 | 2 |');
    expect(text).not.toContain('┌');
  });

  test('renders aligned table cells for center and right alignment', () => {
    const rendered = renderMarkdownLines([
      '| Name | Score |',
      '| :---: | ---: |',
      '| Bob | 7 |',
    ].join('\n'), { maxWidth: 60 });

    const row = rendered.find((line) => line.text.includes('Bob') && line.text.includes('7'));
    expect(row?.tone).toBe('muted');
    expect(row?.text).toMatch(/Bob\s+│\s+\s*7\s+│/);
  });
});
