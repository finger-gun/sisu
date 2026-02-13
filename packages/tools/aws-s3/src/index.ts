import type { Tool, ToolContext } from "@sisu-ai/core";
import { z } from "zod";
import type {
  S3Client as S3ClientType,
  GetObjectCommandInput,
  GetObjectCommandOutput,
  ListObjectsV2CommandInput,
  ListObjectsV2CommandOutput,
  PutObjectCommandInput,
  PutObjectCommandOutput,
  DeleteObjectCommandInput,
  DeleteObjectCommandOutput,
  HeadObjectCommandInput,
  HeadObjectCommandOutput,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";

type V3Client = S3ClientType;
type V2LikeClient = {
  getObject?: (p: GetObjectCommandInput) => Promise<GetObjectCommandOutput>;
  listObjectsV2?: (
    p: ListObjectsV2CommandInput,
  ) => Promise<ListObjectsV2CommandOutput>;
  putObject?: (p: PutObjectCommandInput) => Promise<PutObjectCommandOutput>;
  deleteObject?: (
    p: DeleteObjectCommandInput,
  ) => Promise<DeleteObjectCommandOutput>;
  headObject?: (p: HeadObjectCommandInput) => Promise<HeadObjectCommandOutput>;
};

async function resolveClient(
  ctx: ToolContext,
): Promise<V3Client | V2LikeClient> {
  // Check deps for injected client (for testing/configuration)
  const injectedClient = ctx.deps?.s3Client as
    | (V3Client | V2LikeClient)
    | undefined;
  if (injectedClient) return injectedClient;

  // Construct a v3 client from env
  const region =
    process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
  const mod = await import("@aws-sdk/client-s3");
  const S3Client = mod.S3Client;
  if (!S3Client)
    throw new Error(
      "S3 client not available. Ensure @aws-sdk/client-s3 is installed.",
    );

  const creds =
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: String(process.env.AWS_ACCESS_KEY_ID),
            secretAccessKey: String(process.env.AWS_SECRET_ACCESS_KEY),
          },
        }
      : {};

  return new S3Client({ region, ...creds });
}

function allowWriteFromCtx(ctx: ToolContext): boolean {
  // Check deps for injected allowWrite flag (for testing/configuration)
  const injected = ctx.deps?.s3AllowWrite as boolean | undefined;
  if (typeof injected === "boolean") return injected;

  const env = process.env.AWS_S3_ALLOW_WRITE;
  return !!(env && /^(1|true|yes)$/i.test(env));
}

async function bodyToString(body: unknown): Promise<string> {
  if (!body) return "";
  if (typeof body === "string") return body;
  if (
    typeof (body as { transformToString?: () => Promise<string> })
      .transformToString === "function"
  )
    return (
      body as { transformToString: () => Promise<string> }
    ).transformToString();
  if (Buffer.isBuffer(body)) return body.toString();
  if (body instanceof Uint8Array) return Buffer.from(body).toString();
  if (typeof (body as Readable).read === "function") {
    const chunks: Buffer[] = [];
    for await (const chunk of body as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString();
  }
  return String(body);
}

function isV3Client(c: unknown): c is V3Client {
  return !!c && typeof (c as V3Client).send === "function";
}

type V3CommandMap = {
  GetObjectCommand: {
    input: GetObjectCommandInput;
    output: GetObjectCommandOutput;
  };
  ListObjectsV2Command: {
    input: ListObjectsV2CommandInput;
    output: ListObjectsV2CommandOutput;
  };
  PutObjectCommand: {
    input: PutObjectCommandInput;
    output: PutObjectCommandOutput;
  };
  DeleteObjectCommand: {
    input: DeleteObjectCommandInput;
    output: DeleteObjectCommandOutput;
  };
  HeadObjectCommand: {
    input: HeadObjectCommandInput;
    output: HeadObjectCommandOutput;
  };
};

async function v3Send<K extends keyof V3CommandMap>(
  client: V3Client,
  commandName: K,
  params: V3CommandMap[K]["input"],
): Promise<V3CommandMap[K]["output"]> {
  try {
    const mod = await import("@aws-sdk/client-s3");
    const Ctor = mod[commandName] as
      | (new (input: V3CommandMap[K]["input"]) => unknown)
      | undefined;
    if (!Ctor) throw new Error(`Missing ${commandName} in @aws-sdk/client-s3`);
    const cmd = new Ctor(params);
    return (await client.send(cmd as never)) as V3CommandMap[K]["output"];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`S3 v3 command failed (${commandName}): ${msg}`);
  }
}

export const s3GetObject: Tool<{ bucket: string; key: string }> = {
  name: "s3GetObject",
  description: "Fetch an object from S3 as UTF-8 text.",
  schema: z.object({ bucket: z.string(), key: z.string() }),
  handler: async ({ bucket, key }, ctx) => {
    const c = await resolveClient(ctx);
    let out: GetObjectCommandOutput;
    if (isV3Client(c))
      out = await v3Send(c, "GetObjectCommand", { Bucket: bucket, Key: key });
    else if (typeof (c as V2LikeClient).getObject === "function")
      out = await (c as V2LikeClient).getObject!({ Bucket: bucket, Key: key });
    else throw new Error("S3 client does not support getObject/send");
    return { content: await bodyToString(out?.Body) };
  },
};

export const s3ListObjects: Tool<{ bucket: string; prefix?: string }> = {
  name: "s3ListObjects",
  description: "List object keys in an S3 bucket (uses ListObjectsV2).",
  schema: z.object({ bucket: z.string(), prefix: z.string().optional() }),
  handler: async ({ bucket, prefix }, ctx) => {
    const c = await resolveClient(ctx);
    let out: ListObjectsV2CommandOutput;
    const params = { Bucket: bucket, Prefix: prefix };
    if (isV3Client(c)) out = await v3Send(c, "ListObjectsV2Command", params);
    else if (typeof (c as V2LikeClient).listObjectsV2 === "function")
      out = await (c as V2LikeClient).listObjectsV2!(params);
    else throw new Error("S3 client does not support listObjectsV2/send");
    const contents = out?.Contents || [];
    return (Array.isArray(contents) ? contents : [])
      .map((o) => o?.Key)
      .filter((k): k is string => typeof k === "string" && k.length > 0);
  },
};

export const s3ListObjectsDetailed: Tool<{ bucket: string; prefix?: string }> =
  {
    name: "s3ListObjectsDetailed",
    description: "List objects with details (LastModified ISO).",
    schema: z.object({ bucket: z.string(), prefix: z.string().optional() }),
    handler: async ({ bucket, prefix }, ctx) => {
      const c = await resolveClient(ctx);
      let out: ListObjectsV2CommandOutput;
      const params = { Bucket: bucket, Prefix: prefix };
      if (isV3Client(c)) out = await v3Send(c, "ListObjectsV2Command", params);
      else if (typeof (c as V2LikeClient).listObjectsV2 === "function")
        out = await (c as V2LikeClient).listObjectsV2!(params);
      else throw new Error("S3 client does not support listObjectsV2/send");
      const contents = out?.Contents || [];
      const items: Array<{
        key: string;
        lastModified?: string;
        size?: number;
      }> = [];
      for (const it of Array.isArray(contents) ? contents : []) {
        const lm = it?.LastModified;
        const key = typeof it?.Key === "string" ? it.Key : "";
        if (!key) continue;
        items.push({
          key,
          ...(lm ? { lastModified: new Date(lm).toISOString() } : {}),
          ...(typeof it?.Size === "number" ? { size: it.Size } : {}),
        });
      }
      return items;
    },
  };

export const s3PutObject: Tool<{
  bucket: string;
  key: string;
  content: string;
}> = {
  name: "s3PutObject",
  description: "Upload text content to S3.",
  schema: z.object({
    bucket: z.string(),
    key: z.string(),
    content: z.string(),
  }),
  handler: async ({ bucket, key, content }, ctx) => {
    if (!allowWriteFromCtx(ctx))
      return { ok: false, error: "Write operations are not allowed." } as const;
    const c = await resolveClient(ctx);
    const params = { Bucket: bucket, Key: key, Body: Buffer.from(content) };
    if (isV3Client(c)) await v3Send(c, "PutObjectCommand", params);
    else if (typeof (c as V2LikeClient).putObject === "function")
      await (c as V2LikeClient).putObject!(params);
    else throw new Error("S3 client does not support putObject/send");
    return { ok: true };
  },
};

export const s3DeleteObject: Tool<{ bucket: string; key: string }> = {
  name: "s3DeleteObject",
  description: "Delete an object in S3.",
  schema: z.object({ bucket: z.string(), key: z.string() }),
  handler: async ({ bucket, key }, ctx) => {
    if (!allowWriteFromCtx(ctx))
      return { ok: false, error: "Write operations are not allowed." } as const;
    const c = await resolveClient(ctx);
    const params = { Bucket: bucket, Key: key };
    if (isV3Client(c)) await v3Send(c, "DeleteObjectCommand", params);
    else if (typeof (c as V2LikeClient).deleteObject === "function")
      await (c as V2LikeClient).deleteObject!(params);
    else throw new Error("S3 client does not support deleteObject/send");
    return { ok: true };
  },
};

export const s3GetObjectMetadata: Tool<{ bucket: string; key: string }> = {
  name: "s3GetObjectMetadata",
  description: "Get user-defined metadata for an S3 object.",
  schema: z.object({ bucket: z.string(), key: z.string() }),
  handler: async ({ bucket, key }, ctx) => {
    const c = await resolveClient(ctx);
    const params = { Bucket: bucket, Key: key };
    let out: HeadObjectCommandOutput;
    if (isV3Client(c)) out = await v3Send(c, "HeadObjectCommand", params);
    else if (typeof (c as V2LikeClient).headObject === "function")
      out = await (c as V2LikeClient).headObject!(params);
    else throw new Error("S3 client does not support headObject/send");
    return out?.Metadata ?? {};
  },
};

export default {
  s3GetObject,
  s3ListObjects,
  s3ListObjectsDetailed,
  s3PutObject,
  s3DeleteObject,
  s3GetObjectMetadata,
};
