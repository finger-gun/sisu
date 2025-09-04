import { test, expect, vi } from 'vitest';
import { azureUploadBlob, azureGetBlob } from '../src/index.js';
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
  expect(res.content).toBe('hello');
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
  await expect(azureUploadBlob.handler({ container: 'c', blobName: 'b', content: 'x' } as any, ctxDeny)).rejects.toThrow(/write/i);
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
  const text = await azureGetBlob.handler({ container: 'c', blobName: 'b' } as any, ctx);
  expect(text.content).toBe('hi');
});
