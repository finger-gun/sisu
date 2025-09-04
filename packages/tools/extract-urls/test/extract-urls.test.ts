import { test, expect } from 'vitest';
import { extractUrlsTool } from '../src/index.js';

test('extractUrls finds unique URLs', async () => {
  const res = await extractUrlsTool.handler({ contents: [
    'Visit http://a.com and https://b.com',
    'Duplicate http://a.com should be removed'
  ] } as any, {} as any);
  expect(res).toEqual(['http://a.com', 'https://b.com']);
});

test('extractUrls returns empty array when none found', async () => {
  const res = await extractUrlsTool.handler({ contents: ['no links here'] } as any, {} as any);
  expect(res).toEqual([]);
});
