# @sisu-ai/tool-aws-s3

AWS S3 tools for Sisu. Read, list, delete, and (optionally) write objects. Includes metadata helpers.

## Exports
- `s3GetObject({ bucket, key })` → `{ content: string }`
- `s3ListObjects({ bucket, prefix? })` → `string[]`
- `s3ListObjectsDetailed({ bucket, prefix? })` → `{ key: string; lastModified?: string; size?: number }[]`
- `s3GetObjectMetadata({ bucket, key })` → `Record<string, string>` (user metadata)
- `s3PutObject({ bucket, key, content })` → `{ ok: true } | { ok: false, error: string }`
- `s3DeleteObject({ bucket, key })` → `{ ok: true } | { ok: false, error: string }`

Write operations are guarded. When disabled, write tools return `{ ok: false, error }` (they do not throw).

## Configuration
- Provide a client via `ctx.state.s3.client` (recommended):
  - For AWS SDK v3: `new S3Client({ region, credentials? })`
  - For v2‑like clients: an object supporting `getObject`, `listObjectsV2`, `putObject`, `deleteObject`, `headObject`
- Write guard (default: disabled):
  - `ctx.state.s3.allowWrite = true`, or
  - `AWS_S3_ALLOW_WRITE=1`.

Note: If you only provide a v3 client, this package will `import('@aws-sdk/client-s3')` lazily to create command instances.

## Usage
```ts
import { Agent } from '@sisu-ai/core';
import { registerTools } from '@sisu-ai/mw-register-tools';
import { s3GetObject, s3ListObjectsDetailed, s3DeleteObject } from '@sisu-ai/tool-aws-s3';
import { S3Client } from '@aws-sdk/client-s3';

const app = new Agent().use(registerTools([
  s3GetObject, s3ListObjectsDetailed, s3DeleteObject
]));

ctx.state.s3 = {
  client: new S3Client({ region: process.env.AWS_REGION || 'us-east-1' }),
  allowWrite: false,
};
```

## Read “latest” example
```ts
const items: any[] = await s3ListObjectsDetailed.handler({ bucket: 'my-bucket', prefix: 'folder/' } as any, ctx) as any;
const latest = items
  .filter(i => i.lastModified)
  .sort((a,b) => (a.lastModified! < b.lastModified! ? 1 : -1))[0]?.key;
if (latest) {
  const { content } = await s3GetObject.handler({ bucket: 'my-bucket', key: latest } as any, ctx) as any;
  // optionally delete
  await s3DeleteObject.handler({ bucket: 'my-bucket', key: latest } as any, ctx);
}
```

