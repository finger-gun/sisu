import { test, expect, vi } from 'vitest';
import { createAzureBlobTools, azureUploadBlob, azureGetBlob } from '../src/index.js';
import { Buffer } from 'node:buffer';

test('getBlob downloads content', async () => {
  const service = {
    getContainerClient: () => ({
      getBlockBlobClient: () => ({
        downloadToBuffer: async () => Buffer.from('hello')
      })
    })
  } as any;
  const { getBlob } = createAzureBlobTools({ serviceClient: service });
  const res = await getBlob.handler({ container: 'c', blobName: 'b' } as any, {} as any);
  expect(res.content).toBe('hello');
});

test('uploadBlob respects allowWrite flag', async () => {
  const upload = vi.fn();
  const service = {
    getContainerClient: () => ({
      getBlockBlobClient: () => ({ upload })
    })
  } as any;
  const { uploadBlob } = createAzureBlobTools({ serviceClient: service, allowWrite: true });
  await uploadBlob.handler({ container: 'c', blobName: 'b', content: 'x' } as any, {} as any);
  expect(upload).toHaveBeenCalled();
  const { uploadBlob: denied } = createAzureBlobTools({ serviceClient: service, allowWrite: false });
  await expect(denied.handler({ container: 'c', blobName: 'b', content: 'x' } as any, {} as any)).rejects.toThrow(/write/i);
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
