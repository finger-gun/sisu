import type { Tool } from '@sisu-ai/core';
import { z } from 'zod';
import { BlobServiceClient, type BlobServiceClient as BlobServiceClientType } from '@azure/storage-blob';

export interface AzureBlobToolOptions {
  connectionString?: string;
  serviceClient?: BlobServiceClientType;
  allowWrite?: boolean;
}

function getServiceClient(opts: AzureBlobToolOptions): BlobServiceClientType {
  if (opts.serviceClient) return opts.serviceClient;
  const conn = opts.connectionString ?? process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set');
  return BlobServiceClient.fromConnectionString(conn);
}

export function createAzureBlobTools(opts: AzureBlobToolOptions = {}) {
  const service = getServiceClient(opts);
  const allowWrite = opts.allowWrite ?? false;

  const containerClient = (container: string) => service.getContainerClient(container);

  const getBlob: Tool<{ container: string; blobName: string }> = {
    name: 'azure.getBlob',
    description: 'Fetch a blob as UTF-8 text',
    schema: z.object({ container: z.string(), blobName: z.string() }),
    handler: async ({ container, blobName }) => {
      const block = containerClient(container).getBlockBlobClient(blobName);
      const buf = await block.downloadToBuffer();
      return { content: buf.toString() };
    },
  };

  const listBlobs: Tool<{ container: string; prefix?: string }> = {
    name: 'azure.listBlobs',
    description: 'List blobs in a container, optionally filtered by prefix.',
    schema: z.object({ container: z.string(), prefix: z.string().optional() }),
    handler: async ({ container, prefix }) => {
      const iter = containerClient(container).listBlobsFlat({ prefix });
      const names: string[] = [];
      for await (const b of iter) names.push(b.name);
      return names;
    },
  };

  const uploadBlob: Tool<{ container: string; blobName: string; content: string }> = {
    name: 'azure.uploadBlob',
    description: 'Upload text content to a blob.',
    schema: z.object({ container: z.string(), blobName: z.string(), content: z.string() }),
    handler: async ({ container, blobName, content }) => {
      if (!allowWrite) throw new Error('Write operations disabled');
      const block = containerClient(container).getBlockBlobClient(blobName);
      await block.upload(content, Buffer.byteLength(content));
      return { ok: true };
    },
  };

  const getMetadata: Tool<{ container: string; blobName: string }> = {
    name: 'azure.getMetadata',
    description: 'Get blob metadata.',
    schema: z.object({ container: z.string(), blobName: z.string() }),
    handler: async ({ container, blobName }) => {
      const block = containerClient(container).getBlockBlobClient(blobName);
      const props = await block.getProperties();
      return props.metadata ?? {};
    },
  };

  const setMetadata: Tool<{ container: string; blobName: string; metadata: Record<string, string> }> = {
    name: 'azure.setMetadata',
    description: 'Set metadata on a blob.',
    schema: z.object({ container: z.string(), blobName: z.string(), metadata: z.record(z.string()) }),
    handler: async ({ container, blobName, metadata }) => {
      if (!allowWrite) throw new Error('Write operations disabled');
      const block = containerClient(container).getBlockBlobClient(blobName);
      await block.setMetadata(metadata);
      return { ok: true };
    },
  };

  return { getBlob, listBlobs, uploadBlob, getMetadata, setMetadata };
}

export default createAzureBlobTools;
