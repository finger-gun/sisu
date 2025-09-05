# @sisu-ai/tool-aws-s3
[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Ftool-aws-s3)](https://www.npmjs.com/package/@sisu-ai/tool-aws-s3)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

AWS S3 tools for Sisu. Read, list, delete, and write objects. Includes metadata helpers.

## Exports
- `s3GetObject({ bucket, key })` → `{ content: string }`
- `s3ListObjects({ bucket, prefix? })` → `string[]`
- `s3ListObjectsDetailed({ bucket, prefix? })` → `{ key: string; lastModified?: string; size?: number }[]`
- `s3GetObjectMetadata({ bucket, key })` → `Record<string, string>` (user metadata)
- `s3PutObject({ bucket, key, content })` → `{ ok: true } | { ok: false, error: string }`
- `s3DeleteObject({ bucket, key })` → `{ ok: true } | { ok: false, error: string }`

Write operations are guarded. When disabled, write tools return `{ ok: false, error }` (they do not throw).

## Configuration
  - Region: `AWS_REGION` or `AWS_DEFAULT_REGION` (defaults to `us-east-1`)
  - Credentials (optional): `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` when set; otherwise it relies on the default credential chain
- Optional client injection: Provide your own client via `ctx.state.s3.client` (v3 S3Client or v2‑like shape with `getObject`, `listObjectsV2`, `putObject`, `deleteObject`, `headObject`).
- Write guard (default: disabled):
  - `ctx.state.s3.allowWrite = true`, or
  - `AWS_S3_ALLOW_WRITE=1`.

## Usage
```ts
import { Agent } from '@sisu-ai/core';
import { registerTools } from '@sisu-ai/mw-register-tools';
import { s3GetObject, s3ListObjectsDetailed, s3DeleteObject } from '@sisu-ai/tool-aws-s3';

const app = new Agent().use(registerTools([
  s3GetObject, s3ListObjectsDetailed, s3DeleteObject
]));

// Optional: tweak write policy; region/creds read from env
ctx.state.s3 = { allowWrite: false };
```

Env vars commonly used
- `AWS_REGION` or `AWS_DEFAULT_REGION`
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (optional if using instance/profile/role creds)
- `AWS_S3_ALLOW_WRITE` (set to `1`/`true` to enable writes)

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

# Community & Support
- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
```
