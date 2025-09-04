import { test, expect, vi } from 'vitest';
import { azureUploadBlob, azureGetBlob, azureDeleteBlob, azureListBlobsDetailed } from '../src/index.js';
import { Buffer } from 'node:buffer';

test('getBlob downloads content (static tool)', async () => {
  const service = {
    getContainerClient: () => ({
      getBlockBlobClient: () => ({
        downloadToBuffer: async () => Buffer.from('hello')
      })
    })
  } as any;
  const ctx = { state: { azureBlob: { serviceClient: service } } } as any;
  const res = await azureGetBlob.handler({ container: 'c', blobName: 'b' } as any, ctx);
  expect((res as { content: string }).content).toBe('hello');
});

test('uploadBlob respects allowWrite flag (static tool)', async () => {
  const upload = vi.fn();
  const service = {
    getContainerClient: () => ({
      getBlockBlobClient: () => ({ upload })
    })
  } as any;
  const ctxAllow = { state: { azureBlob: { serviceClient: service, allowWrite: true } } } as any;
  await azureUploadBlob.handler({ container: 'c', blobName: 'b', content: 'x' } as any, ctxAllow);
  expect(upload).toHaveBeenCalled();

  const ctxDeny = { state: { azureBlob: { serviceClient: service, allowWrite: false } } } as any;
  const res = await azureUploadBlob.handler({ container: 'c', blobName: 'b', content: 'x' } as any, ctxDeny) as any;
  expect(res?.ok).toBe(false);
  expect(String(res?.error || '')).toMatch(/write/i);
});

test('deleteBlob deletes when allowed and returns error when disabled', async () => {
  const del = vi.fn();
  const service = {
    getContainerClient: () => ({
      getBlockBlobClient: () => ({ delete: del })
    })
  } as any;
  const ctxAllow = { state: { azureBlob: { serviceClient: service, allowWrite: true } } } as any;
  await azureDeleteBlob.handler({ container: 'c', blobName: 'b' } as any, ctxAllow);
  expect(del).toHaveBeenCalled();

  const ctxDeny = { state: { azureBlob: { serviceClient: service, allowWrite: false } } } as any;
  const res = await azureDeleteBlob.handler({ container: 'c', blobName: 'b' } as any, ctxDeny) as any;
  expect(res?.ok).toBe(false);
  expect(String(res?.error || '')).toMatch(/write/i);
});

test('listBlobsDetailed returns names with lastModified ISO', async () => {
  async function* makeIter() {
    yield { name: 'a.txt', properties: { lastModified: new Date('2020-01-01T00:00:00Z') } } as any;
    yield { name: 'b.txt', properties: { lastModified: new Date('2021-06-15T12:34:56Z') } } as any;
  }
  const service = {
    getContainerClient: () => ({ listBlobsFlat: () => makeIter() })
  } as any;
  const ctx = { state: { azureBlob: { serviceClient: service } } } as any;
  const res = await azureListBlobsDetailed.handler({ container: 'c' } as any, ctx);
  expect(res).toEqual([
    { name: 'a.txt', lastModified: '2020-01-01T00:00:00.000Z' },
    { name: 'b.txt', lastModified: '2021-06-15T12:34:56.000Z' },
  ]);
});

test('static tools read config from ctx.state and guard writes', async () => {
  const upload = vi.fn();
  const downloadToBuffer = vi.fn(async () => Buffer.from('hi'));
  const service = {
    getContainerClient: () => ({
      getBlockBlobClient: () => ({ upload, downloadToBuffer, setMetadata: vi.fn(), getProperties: vi.fn(async () => ({ metadata: {} })) })
    })
  } as any;
  const ctx = { state: { azureBlob: { serviceClient: service, allowWrite: true } } } as any;
  await azureUploadBlob.handler({ container: 'c', blobName: 'b', content: 'x' } as any, ctx);
  expect(upload).toHaveBeenCalled();
  const text = await azureGetBlob.handler({ container: 'c', blobName: 'b' } as any, ctx) as { content: string };
  expect(text.content).toBe('hi');
});
