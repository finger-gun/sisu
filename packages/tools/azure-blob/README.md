# @sisu-ai/tool-azure-blob

Azure Blob Storage tools for Sisu. Read, list, and (optionally) write blobs. Includes metadata operations.

Key ops
- `azure.getBlob({ container, blobName })` — read UTF‑8 text
- `azure.listBlobs({ container, prefix? })` — list names
- `azure.uploadBlob({ container, blobName, content })` — write text (guarded)
- `azure.getMetadata({ container, blobName })` — read metadata
- `azure.setMetadata({ container, blobName, metadata })` — write metadata (guarded)

Configuration
- Connection: set `AZURE_STORAGE_CONNECTION_STRING` or provide `ctx.state.azureBlob.connectionString` or `ctx.state.azureBlob.serviceClient`.
- Write guard: default off. Enable with `ctx.state.azureBlob.allowWrite = true` or `AZURE_BLOB_ALLOW_WRITE=1`.

Usage (preferred: static tools)
```ts
import { registerTools } from '@sisu-ai/mw-register-tools';
import { azureBlobTools } from '@sisu-ai/tool-azure-blob';

agent.use(registerTools(azureBlobTools));

// Optional runtime config
ctx.state.azureBlob = {
  connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING!,
  allowWrite: false, // set true to permit upload/setMetadata
};
```

Usage (factory: inject client and flags)
```ts
import createAzureBlobTools from '@sisu-ai/tool-azure-blob';

const { getBlob, listBlobs, uploadBlob } = createAzureBlobTools({
  connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
  allowWrite: true,
});

agent.use(registerTools([getBlob, listBlobs, uploadBlob]));
```

Notes
- For binary content, extend `getBlob` to return buffers; this tool defaults to UTF‑8 text for simplicity.
- For SAS tokens or Managed Identity, construct a `serviceClient` externally and pass via factory or `ctx.state.azureBlob.serviceClient`.
