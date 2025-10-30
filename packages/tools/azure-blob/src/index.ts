import type { Tool, ToolContext } from '@sisu-ai/core';
import { z } from 'zod';
import { BlobServiceClient, type BlobServiceClient as BlobServiceClientType } from '@azure/storage-blob';

export interface AzureBlobToolOptions {
  connectionString?: string;
  serviceClient?: BlobServiceClientType;
  allowWrite?: boolean;
}

function resolveServiceFromCtx(ctx: ToolContext): BlobServiceClientType {
  const config = ctx.deps?.azureBlob as AzureBlobToolOptions | undefined;
  if (config?.serviceClient) return config.serviceClient;
  
  const conn = config?.connectionString || process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set (or provide via ctx.deps.azureBlob.connectionString)');
  return BlobServiceClient.fromConnectionString(conn);
}

function allowWriteFromCtx(ctx: ToolContext): boolean {
  const config = ctx.deps?.azureBlob as AzureBlobToolOptions | undefined;
  if (typeof config?.allowWrite === 'boolean') return config.allowWrite;
  
  const env = process.env.AZURE_BLOB_ALLOW_WRITE;
  return !!(env && /^(1|true|yes)$/i.test(env));
}

const base = {
  containerClient(ctx: ToolContext, container: string) {
    return resolveServiceFromCtx(ctx).getContainerClient(container);
  }
};

export const azureGetBlob: Tool<{ container: string; blobName: string }> = {
  name: 'azureGetBlob',
  description: 'Fetch a blob as UTF-8 text from Azure Storage.',
  schema: z.object({ container: z.string(), blobName: z.string() }),
  handler: async ({ container, blobName }, ctx) => {
    const block = base.containerClient(ctx, container).getBlockBlobClient(blobName);
    const buf = await block.downloadToBuffer();
    return { content: buf.toString() };
  },
};

export const azureListBlobs: Tool<{ container: string; prefix?: string }> = {
  name: 'azureListBlobs',
  description: 'List blobs in a container, optionally filtered by prefix.',
  schema: z.object({ container: z.string(), prefix: z.string().optional() }),
  handler: async ({ container, prefix }, ctx) => {
    const iter = base.containerClient(ctx, container).listBlobsFlat({ prefix });
    const names: string[] = [];
    for await (const b of iter) names.push(b.name);
    return names;
  },
};

export const azureListBlobsDetailed: Tool<{ container: string; prefix?: string }> = {
  name: 'azureListBlobsDetailed',
  description: 'List blobs with details (e.g., lastModified) in a container, optionally filtered by prefix.',
  schema: z.object({ container: z.string(), prefix: z.string().optional() }),
  handler: async ({ container, prefix }, ctx) => {
    const iter = base.containerClient(ctx, container).listBlobsFlat({ prefix });
    const items: Array<{ name: string; lastModified?: string }> = [];
    for await (const b of iter as any) {
      const lm = b?.properties?.lastModified ?? b?.lastModified;
      items.push({ name: b.name, ...(lm ? { lastModified: new Date(lm).toISOString() } : {}) });
    }
    return items;
  },
};

export const azureUploadBlob: Tool<{ container: string; blobName: string; content: string }> = {
  name: 'azureUploadBlob',
  description: 'Upload text content to a blob in Azure Storage.',
  schema: z.object({ container: z.string(), blobName: z.string(), content: z.string() }),
  handler: async ({ container, blobName, content }, ctx) => {
    if (!allowWriteFromCtx(ctx)) return { ok: false, error: 'Write operations are not allowed.' };
    const block = base.containerClient(ctx, container).getBlockBlobClient(blobName);
    await block.upload(content, Buffer.byteLength(content));
    return { ok: true };
  },
};

export const azureGetMetadata: Tool<{ container: string; blobName: string }> = {
  name: 'azureGetMetadata',
  description: 'Get blob metadata in Azure Storage.',
  schema: z.object({ container: z.string(), blobName: z.string() }),
  handler: async ({ container, blobName }, ctx) => {
    const block = base.containerClient(ctx, container).getBlockBlobClient(blobName);
    const props = await block.getProperties();
    return props.metadata ?? {};
  },
};

export const azureSetMetadata: Tool<{ container: string; blobName: string; metadata: Record<string, string> }> = {
  name: 'azureSetMetadata',
  description: 'Set metadata on a blob in Azure Storage.',
  schema: z.object({ container: z.string(), blobName: z.string(), metadata: z.record(z.string()) }),
  handler: async ({ container, blobName, metadata }, ctx) => {
    if (!allowWriteFromCtx(ctx)) return { ok: false, error: 'Write operations are not allowed.' };
    const block = base.containerClient(ctx, container).getBlockBlobClient(blobName);
    await block.setMetadata(metadata);
    return { ok: true };
  },
};

export const azureDeleteBlob: Tool<{ container: string; blobName: string }> = {
  name: 'azureDeleteBlob',
  description: 'Delete a blob in Azure Storage.',
  schema: z.object({ container: z.string(), blobName: z.string() }),
  handler: async ({ container, blobName }, ctx) => {
    if (!allowWriteFromCtx(ctx)) return { ok: false, error: 'Write operations are not allowed.' };
    const block = base.containerClient(ctx, container).getBlockBlobClient(blobName);
    await block.delete();
    return { ok: true };
  },
};

export default {
  azureGetBlob,
  azureListBlobs,
  azureListBlobsDetailed,
  azureUploadBlob,
  azureGetMetadata,
  azureSetMetadata,
  azureDeleteBlob
}
