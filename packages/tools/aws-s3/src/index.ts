import type { Tool } from '@sisu-ai/core';
import { z } from 'zod';

type S3Ctx = { state?: any } | undefined;

type V3Client = { send: (cmd: any) => Promise<any> };
type V2LikeClient = {
  getObject?: (p: any) => Promise<any>;
  listObjectsV2?: (p: any) => Promise<any>;
  putObject?: (p: any) => Promise<any>;
  deleteObject?: (p: any) => Promise<any>;
  headObject?: (p: any) => Promise<any>;
};

async function resolveClient(ctx: S3Ctx): Promise<V3Client | V2LikeClient> {
  const c = (ctx as any)?.state?.s3?.client;
  if (c) return c as any;
  // Construct a v3 client from env if not provided
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
  const mod = await import('@aws-sdk/client-s3');
  const S3Client = (mod as any).S3Client;
  if (!S3Client) throw new Error('S3 client not available. Ensure @aws-sdk/client-s3 is installed.');
  
  const creds = (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
    ? { credentials: { accessKeyId: String(process.env.AWS_ACCESS_KEY_ID), secretAccessKey: String(process.env.AWS_SECRET_ACCESS_KEY) } }
    : {};

  return new S3Client({ region, ...creds });
}

function allowWriteFromCtx(ctx: S3Ctx): boolean {
  const v = (ctx as any)?.state?.s3?.allowWrite;
  if (typeof v === 'boolean') return v;
  const env = process.env.AWS_S3_ALLOW_WRITE;
  return !!(env && /^(1|true|yes)$/i.test(env));
}

async function bodyToString(body: any): Promise<string> {
  if (!body) return '';
  if (typeof body === 'string') return body;
  if (typeof (body as any).transformToString === 'function') return (body as any).transformToString();
  if (Buffer.isBuffer(body)) return body.toString();
  if (body instanceof Uint8Array) return Buffer.from(body).toString();
  return String(body);
}

function isV3Client(c: any): c is V3Client { return c && typeof c.send === 'function'; }

async function v3Send(client: V3Client, commandName: string, params: any): Promise<any> {
  try {
    const mod = await import('@aws-sdk/client-s3');
    const Ctor = (mod as any)[commandName];
    if (!Ctor) throw new Error(`Missing ${commandName} in @aws-sdk/client-s3`);
    const cmd = new Ctor(params);
    return await client.send(cmd);
  } catch (e) {
    throw new Error(`S3 v3 command failed (${commandName}): ${String((e as any)?.message || e)}`);
  }
}

export const s3GetObject: Tool<{ bucket: string; key: string }> = {
  name: 's3GetObject',
  description: 'Fetch an object from S3 as UTF-8 text.',
  schema: z.object({ bucket: z.string(), key: z.string() }),
  handler: async ({ bucket, key }, ctx) => {
    const c = await resolveClient(ctx);
    let out: any;
    if (isV3Client(c)) out = await v3Send(c, 'GetObjectCommand', { Bucket: bucket, Key: key });
    else if (typeof (c as V2LikeClient).getObject === 'function') out = await (c as V2LikeClient).getObject!({ Bucket: bucket, Key: key });
    else throw new Error('S3 client does not support getObject/send');
    return { content: await bodyToString(out?.Body) };
  }
};

export const s3ListObjects: Tool<{ bucket: string; prefix?: string }> = {
  name: 's3ListObjects',
  description: 'List object keys in an S3 bucket (uses ListObjectsV2).',
  schema: z.object({ bucket: z.string(), prefix: z.string().optional() }),
  handler: async ({ bucket, prefix }, ctx) => {
    const c = await resolveClient(ctx);
    let out: any;
    const params = { Bucket: bucket, Prefix: prefix };
    if (isV3Client(c)) out = await v3Send(c, 'ListObjectsV2Command', params);
    else if (typeof (c as V2LikeClient).listObjectsV2 === 'function') out = await (c as V2LikeClient).listObjectsV2!(params);
    else throw new Error('S3 client does not support listObjectsV2/send');
    const contents = out?.Contents || [];
    return (Array.isArray(contents) ? contents : []).map((o: any) => o?.Key).filter(Boolean);
  }
};

export const s3ListObjectsDetailed: Tool<{ bucket: string; prefix?: string }> = {
  name: 's3ListObjectsDetailed',
  description: 'List objects with details (LastModified ISO).',
  schema: z.object({ bucket: z.string(), prefix: z.string().optional() }),
  handler: async ({ bucket, prefix }, ctx) => {
    const c = await resolveClient(ctx);
    let out: any;
    const params = { Bucket: bucket, Prefix: prefix };
    if (isV3Client(c)) out = await v3Send(c, 'ListObjectsV2Command', params);
    else if (typeof (c as V2LikeClient).listObjectsV2 === 'function') out = await (c as V2LikeClient).listObjectsV2!(params);
    else throw new Error('S3 client does not support listObjectsV2/send');
    const contents = out?.Contents || [];
    const items: Array<{ key: string; lastModified?: string; size?: number }> = [];
    for (const it of (Array.isArray(contents) ? contents : [])) {
      const lm = it?.LastModified;
      items.push({ key: it?.Key, ...(lm ? { lastModified: new Date(lm).toISOString() } : {}), ...(typeof it?.Size === 'number' ? { size: it.Size } : {}) });
    }
    return items.filter(i => !!i.key);
  }
};

export const s3PutObject: Tool<{ bucket: string; key: string; content: string }> = {
  name: 's3PutObject',
  description: 'Upload text content to S3.',
  schema: z.object({ bucket: z.string(), key: z.string(), content: z.string() }),
  handler: async ({ bucket, key, content }, ctx) => {
    if (!allowWriteFromCtx(ctx)) return { ok: false, error: 'Write operations are not allowed.' } as const;
    const c = await resolveClient(ctx);
    const params = { Bucket: bucket, Key: key, Body: Buffer.from(content) };
    if (isV3Client(c)) await v3Send(c, 'PutObjectCommand', params);
    else if (typeof (c as V2LikeClient).putObject === 'function') await (c as V2LikeClient).putObject!(params);
    else throw new Error('S3 client does not support putObject/send');
    return { ok: true };
  }
};

export const s3DeleteObject: Tool<{ bucket: string; key: string }> = {
  name: 's3DeleteObject',
  description: 'Delete an object in S3.',
  schema: z.object({ bucket: z.string(), key: z.string() }),
  handler: async ({ bucket, key }, ctx) => {
    if (!allowWriteFromCtx(ctx)) return { ok: false, error: 'Write operations are not allowed.' } as const;
    const c = await resolveClient(ctx);
    const params = { Bucket: bucket, Key: key };
    if (isV3Client(c)) await v3Send(c, 'DeleteObjectCommand', params);
    else if (typeof (c as V2LikeClient).deleteObject === 'function') await (c as V2LikeClient).deleteObject!(params);
    else throw new Error('S3 client does not support deleteObject/send');
    return { ok: true };
  }
};

export const s3GetObjectMetadata: Tool<{ bucket: string; key: string }> = {
  name: 's3GetObjectMetadata',
  description: 'Get user-defined metadata for an S3 object.',
  schema: z.object({ bucket: z.string(), key: z.string() }),
  handler: async ({ bucket, key }, ctx) => {
    const c = await resolveClient(ctx);
    const params = { Bucket: bucket, Key: key };
    let out: any;
    if (isV3Client(c)) out = await v3Send(c, 'HeadObjectCommand', params);
    else if (typeof (c as V2LikeClient).headObject === 'function') out = await (c as V2LikeClient).headObject!(params);
    else throw new Error('S3 client does not support headObject/send');
    return out?.Metadata ?? {};
  }
};

export default {
  s3GetObject,
  s3ListObjects,
  s3ListObjectsDetailed,
  s3PutObject,
  s3DeleteObject,
  s3GetObjectMetadata,
};
