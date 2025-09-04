import { z } from 'zod';
import { BlobServiceClient } from '@azure/storage-blob';
function getServiceClient(opts) {
    if (opts.serviceClient)
        return opts.serviceClient;
    const conn = opts.connectionString ?? process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!conn)
        throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set');
    return BlobServiceClient.fromConnectionString(conn);
}
export function createAzureBlobTools(opts = {}) {
    const service = getServiceClient(opts);
    const allowWrite = opts.allowWrite ?? false;
    const containerClient = (container) => service.getContainerClient(container);
    const getBlob = {
        name: 'azure.getBlob',
        description: 'Fetch a blob as UTF-8 text',
        schema: z.object({ container: z.string(), blobName: z.string() }),
        handler: async ({ container, blobName }) => {
            const block = containerClient(container).getBlockBlobClient(blobName);
            const buf = await block.downloadToBuffer();
            return { content: buf.toString() };
        },
    };
    const listBlobs = {
        name: 'azure.listBlobs',
        description: 'List blobs in a container, optionally filtered by prefix.',
        schema: z.object({ container: z.string(), prefix: z.string().optional() }),
        handler: async ({ container, prefix }) => {
            const iter = containerClient(container).listBlobsFlat({ prefix });
            const names = [];
            for await (const b of iter)
                names.push(b.name);
            return names;
        },
    };
    const uploadBlob = {
        name: 'azure.uploadBlob',
        description: 'Upload text content to a blob.',
        schema: z.object({ container: z.string(), blobName: z.string(), content: z.string() }),
        handler: async ({ container, blobName, content }) => {
            if (!allowWrite)
                throw new Error('Write operations disabled');
            const block = containerClient(container).getBlockBlobClient(blobName);
            await block.upload(content, Buffer.byteLength(content));
            return { ok: true };
        },
    };
    const getMetadata = {
        name: 'azure.getMetadata',
        description: 'Get blob metadata.',
        schema: z.object({ container: z.string(), blobName: z.string() }),
        handler: async ({ container, blobName }) => {
            const block = containerClient(container).getBlockBlobClient(blobName);
            const props = await block.getProperties();
            return props.metadata ?? {};
        },
    };
    const setMetadata = {
        name: 'azure.setMetadata',
        description: 'Set metadata on a blob.',
        schema: z.object({ container: z.string(), blobName: z.string(), metadata: z.record(z.string()) }),
        handler: async ({ container, blobName, metadata }) => {
            if (!allowWrite)
                throw new Error('Write operations disabled');
            const block = containerClient(container).getBlockBlobClient(blobName);
            await block.setMetadata(metadata);
            return { ok: true };
        },
    };
    return { getBlob, listBlobs, uploadBlob, getMetadata, setMetadata };
}
export default createAzureBlobTools;
