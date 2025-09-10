# @sisu-ai/tool-azure-blob

Azure Blob Storage tools for Sisu. Read, list, delete, and  write blobs. Includes metadata operations.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Ftool-azure-blob)](https://www.npmjs.com/package/@sisu-ai/tool-azure-blob)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

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

# Community & Support

Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu. Example projects live under [`examples/`](https://github.com/finger-gun/sisu/tree/main/examples) in the repo.


- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)