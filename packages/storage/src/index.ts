// =============================================================================
// @o/storage — signed-URL storage abstraction
// =============================================================================
// One interface, two backends. R2 is primary (cheap, fast, no egress fees).
// S3 is the fallback (works on AWS or self-hosted MinIO).
//
// The point of this package is: nowhere else in the codebase knows which
// backend is in use. The photo worker, the API, the client portal — all of
// them call `getStorage()` and use the same 5 methods.

export interface PutObjectInput {
  key: string;
  body: Buffer | Uint8Array | ReadableStream;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface StorageBackend {
  /** Upload a buffer / stream to the given key. Returns the storage URL. */
  put(input: PutObjectInput): Promise<{ key: string; url: string }>;

  /** Generate a short-lived signed URL the browser can PUT to directly. */
  presignPut(key: string, contentType: string, ttlSeconds?: number): Promise<string>;

  /** Generate a signed URL the browser can GET from. */
  presignGet(key: string, ttlSeconds?: number): Promise<string>;

  /** Permanently delete an object. */
  remove(key: string): Promise<void>;

  /** Public URL for a key (works for assets that are intentionally public). */
  publicUrl(key: string): string;
}

let cached: StorageBackend | null = null;

export function getStorage(): StorageBackend {
  if (cached) return cached;
  const backend = (process.env.STORAGE_BACKEND ?? "r2").toLowerCase();
  if (backend === "r2") {
    cached = makeR2Backend();
  } else if (backend === "s3") {
    cached = makeS3Backend();
  } else {
    throw new Error(`Unknown STORAGE_BACKEND: ${backend}`);
  }
  return cached;
}

/** Reset the cached backend. Used by tests. */
export function _resetStorage() { cached = null; }

// -----------------------------------------------------------------------------
// Cloudflare R2 — primary
// -----------------------------------------------------------------------------
// R2 is S3-compatible, so the same S3 client works. We just point it at
// the R2 endpoint and use Cloudflare's access keys.

function makeR2Backend(): StorageBackend {
  // Dynamic import so the @aws-sdk dep isn't pulled into the Cloudflare Worker
  // bundle. The Worker uses fetch() directly (see photo-worker/src/r2.ts).
  if (typeof process === "undefined" || !process.versions?.node) {
    throw new Error("R2 backend must be used from a Node runtime, not an edge runtime. Use presignedR2() in the Worker instead.");
  }
  return makeS3Backend({
    endpoint: process.env.R2_ENDPOINT,
    region: "auto",
    bucket: process.env.R2_BUCKET!,
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    publicHost: process.env.R2_PUBLIC_HOST, // optional CDN host for public assets
  });
}

// -----------------------------------------------------------------------------
// S3 / MinIO — fallback
// -----------------------------------------------------------------------------
// Used for local dev (MinIO via docker-compose), or for production on AWS.

interface S3Config {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicHost?: string;
}

function makeS3Backend(configOverride?: S3Config): StorageBackend {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

  const config = configOverride ?? {
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "us-east-1",
    bucket: process.env.S3_BUCKET!,
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    publicHost: process.env.S3_PUBLIC_HOST,
  };

  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    forcePathStyle: !!config.endpoint, // MinIO needs this; AWS S3 doesn't
  });

  return {
    async put({ key, body, contentType, metadata }) {
      await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: metadata,
      }));
      return { key, url: this.publicUrl(key) };
    },

    async presignPut(key, contentType, ttlSeconds = 600) {
      return getSignedUrl(client, new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        ContentType: contentType,
      }), { expiresIn: ttlSeconds });
    },

    async presignGet(key, ttlSeconds = 3600) {
      return getSignedUrl(client, new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }), { expiresIn: ttlSeconds });
    },

    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },

    publicUrl(key) {
      if (config.publicHost) {
        return `${config.publicHost.replace(/\/$/, "")}/${key}`;
      }
      if (config.endpoint) {
        return `${config.endpoint.replace(/\/$/, "")}/${config.bucket}/${key}`;
      }
      return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
    },
  };
}

// -----------------------------------------------------------------------------
// Key naming convention
// -----------------------------------------------------------------------------
// Every key is namespaced by tenant and asset type. This lets us:
//   - Scope IAM policies per-tenant
//   - Run lifecycle rules per-type (e.g. delete intermediates after 7 days)
//   - Generate clean Cloudflare cache keys
//
// Pattern:   {tenant}/{type}/{id}/{filename}
// Example:   noira/photos/job_abc123/original.jpg
//            noira/photos/job_abc123/upscaled-2x.jpg
//            noira/photos/job_abc123/no-bg.png

export function buildKey(parts: {
  tenant: string;
  type: "photos" | "files" | "exports" | "raw";
  id: string;
  filename: string;
}): string {
  const safeName = parts.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${parts.tenant}/${parts.type}/${parts.id}/${safeName}`;
}
