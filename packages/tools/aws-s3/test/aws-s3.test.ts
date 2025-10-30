import { test, expect, vi } from 'vitest';
import type { ToolContext } from '@sisu-ai/core';
import { s3GetObject, s3ListObjects, s3ListObjectsDetailed, s3PutObject, s3DeleteObject, s3GetObjectMetadata } from '../src/index.js';

const ctxWith = (client: any, allowWrite?: boolean): ToolContext => {
  const deps: Record<string, unknown> = { s3Client: client };
  if (typeof allowWrite === 'boolean') {
    deps.s3AllowWrite = allowWrite;
  }
  return {
    memory: {
      get: vi.fn(),
      set: vi.fn(),
    },
    signal: new AbortController().signal,
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    model: {} as any,
    deps,
  } as ToolContext;
};

test('s3GetObject returns UTF-8 content', async () => {
  const client = { getObject: vi.fn(async () => ({ Body: Buffer.from('hello') })) };
  const out: any = await s3GetObject.handler({ bucket: 'b', key: 'k' } as any, ctxWith(client));
  expect(out.content).toBe('hello');
});

test('s3ListObjects returns keys', async () => {
  const client = { listObjectsV2: vi.fn(async () => ({ Contents: [{ Key: 'a' }, { Key: 'b' }] })) };
  const out: any = await s3ListObjects.handler({ bucket: 'b' } as any, ctxWith(client));
  expect(out).toEqual(['a', 'b']);
});

test('s3ListObjectsDetailed returns keys with lastModified', async () => {
  const client = { listObjectsV2: vi.fn(async () => ({ Contents: [{ Key: 'a', LastModified: new Date('2020-01-01') }, { Key: 'b', LastModified: new Date('2021-07-01') }] })) };
  const out: any = await s3ListObjectsDetailed.handler({ bucket: 'b' } as any, ctxWith(client));
  expect(out).toEqual([
    { key: 'a', lastModified: '2020-01-01T00:00:00.000Z' },
    { key: 'b', lastModified: '2021-07-01T00:00:00.000Z' },
  ]);
});

test('s3PutObject obeys allowWrite flag', async () => {
  const putObject = vi.fn(async () => ({}));
  const client = { putObject };
  const allow = await s3PutObject.handler({ bucket: 'b', key: 'k', content: 'x' } as any, ctxWith(client, true)) as any;
  expect(putObject).toHaveBeenCalled();
  expect(allow.ok).toBe(true);

  const deny = await s3PutObject.handler({ bucket: 'b', key: 'k', content: 'x' } as any, ctxWith(client, false)) as any;
  expect(deny.ok).toBe(false);
});

test('s3DeleteObject obeys allowWrite flag', async () => {
  const del = vi.fn(async () => ({}));
  const client = { deleteObject: del };
  const allow = await s3DeleteObject.handler({ bucket: 'b', key: 'k' } as any, ctxWith(client, true)) as any;
  expect(del).toHaveBeenCalled();
  expect(allow.ok).toBe(true);

  const deny = await s3DeleteObject.handler({ bucket: 'b', key: 'k' } as any, ctxWith(client, false)) as any;
  expect(deny.ok).toBe(false);
});

test('s3GetObjectMetadata returns metadata map', async () => {
  const client = { headObject: vi.fn(async () => ({ Metadata: { foo: 'bar' } })) };
  const out: any = await s3GetObjectMetadata.handler({ bucket: 'b', key: 'k' } as any, ctxWith(client));
  expect(out).toEqual({ foo: 'bar' });
});

