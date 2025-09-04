# @sisu-ai/tool-azure-blob

Tools for interacting with Azure Blob Storage. Supports reading, listing and (optionally) writing blobs. Configure with an Azure storage connection string via `AZURE_STORAGE_CONNECTION_STRING` or by passing `connectionString` when creating the tools.

```ts
import createAzureBlobTools from '@sisu-ai/tool-azure-blob';
const { getBlob, listBlobs } = createAzureBlobTools();
```
