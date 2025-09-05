# @sisu-ai/tool-azure-blob

Azure Blob Storage tools for Sisu. Read, list, delete, and  write blobs. Includes metadata operations.

## Exports
- `azureGetBlob({ container, blobName })` → `{ content: string }`
- `azureListBlobs({ container, prefix? })` → `string[]`
- `azureListBlobsDetailed({ container, prefix? })` → `{ name: string; lastModified?: string }[]`
- `azureGetMetadata({ container, blobName })` → `Record<string, string>` (user metadata)
- `azureUploadBlob({ container, blobName, content })` → `{ ok: true } | { ok: false, error: string }`
- `azureSetMetadata({ container, blobName, metadata })` → `{ ok: true } | { ok: false, error: string }`
- `azureDeleteBlob({ container, blobName })` → `{ ok: true } | { ok: false, error: string }`

Write operations are guarded. When writes are disabled the write tools return `{ ok: false, error }` (they do not throw).

## Configuration
- Connection:
  - `AZURE_STORAGE_CONNECTION_STRING`, or
  - `ctx.state.azureBlob.connectionString`, or
  - `ctx.state.azureBlob.serviceClient` (an instance of `BlobServiceClient`).
- Write guard (default: disabled):
  - `ctx.state.azureBlob.allowWrite = true`, or
  - `AZURE_BLOB_ALLOW_WRITE=1`.

## Usage
```ts
import { Agent } from '@sisu-ai/core';
import { registerTools } from '@sisu-ai/mw-register-tools';
import {
  azureGetBlob,
  azureListBlobs,
  azureListBlobsDetailed,
  azureGetMetadata,
  azureUploadBlob,
  azureSetMetadata,
  azureDeleteBlob,
} from '@sisu-ai/tool-azure-blob';

const app = new Agent().use(registerTools([
  azureGetBlob,
  azureListBlobs,
  azureListBlobsDetailed,
  azureGetMetadata,
  azureUploadBlob,
  azureSetMetadata,
  azureDeleteBlob,
]));

// Optional runtime config
ctx.state.azureBlob = {
  connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING!,
  allowWrite: false, // set true to permit upload/setMetadata/delete
};
```

## Read “latest” example
```ts
// 1) List blobs with lastModified, pick the newest
const items: Array<{ name: string; lastModified?: string }> = await azureListBlobsDetailed.handler({ container: 'rag' }, ctx) as any;
const latest = items
  .filter(i => i.lastModified)
  .sort((a,b) => (a.lastModified! < b.lastModified! ? 1 : -1))[0]?.name;

// 2) Read its contents
if (latest) {
  const { content } = await azureGetBlob.handler({ container: 'rag', blobName: latest }, ctx) as any;
  // 3) Optionally delete (requires allowWrite=true)
  await azureDeleteBlob.handler({ container: 'rag', blobName: latest }, ctx);
}
```
