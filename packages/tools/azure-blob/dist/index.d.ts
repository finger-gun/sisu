import type { Tool } from '@sisu-ai/core';
import { type BlobServiceClient as BlobServiceClientType } from '@azure/storage-blob';
export interface AzureBlobToolOptions {
    connectionString?: string;
    serviceClient?: BlobServiceClientType;
    allowWrite?: boolean;
}
export declare function createAzureBlobTools(opts?: AzureBlobToolOptions): {
    getBlob: Tool<{
        container: string;
        blobName: string;
    }>;
    listBlobs: Tool<{
        container: string;
        prefix?: string;
    }>;
    uploadBlob: Tool<{
        container: string;
        blobName: string;
        content: string;
    }>;
    getMetadata: Tool<{
        container: string;
        blobName: string;
    }>;
    setMetadata: Tool<{
        container: string;
        blobName: string;
        metadata: Record<string, string>;
    }>;
};
export default createAzureBlobTools;
