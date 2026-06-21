// =============================================================================
// o.company · /api/photos — photo pipeline API
// =============================================================================
// Endpoints:
//   POST   /api/photos/upload-url      get a signed URL to upload directly to R2
//   POST   /api/photos/jobs            create a new job (enqueues processing)
//   GET    /api/photos/jobs            list jobs for the org
//   GET    /api/photos/jobs/:id        get one job with all variations
//   POST   /api/photos/jobs/:id/status (worker callback) update job status
//   GET    /api/photos/presets         list variation presets (public)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/middleware/with-auth";
import { getDb } from "@o/db/client";
import { photoJobs, photoVariations } from "@o/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getStorage, buildKey } from "@o/storage";
import { PRESETS, getPreset, PhotoVariationKind, VARIATION_KINDS } from "@o/photo";
import { errors, AppError } from "@o/errors";
import { logger } from "@o/logger";
import { randomUUID } from "crypto";

// -----------------------------------------------------------------------------
// POST /api/photos/upload-url
// -----------------------------------------------------------------------------
// The client calls this first to get a signed PUT URL. Then it uploads the
// file directly to R2 from the browser. This avoids streaming 50MB through
// the API server.

const UploadUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().regex(/^image\/(jpeg|png|webp|heic|heif)$/),
  sizeBytes: z.number().int().min(1).max(50 * 1024 * 1024),
});

export const uploadUrl = withAuth(async (ctx) => {
  const body = UploadUrlSchema.parse(await ctx.req.json());
  const orgId = ctx.org.id;
  const userId = ctx.person.id;

  const tempId = randomUUID();
  const key = buildKey({
    tenant: orgId,
    type: "photos",
    id: tempId,
    filename: body.filename,
  });

  const storage = getStorage();
  const url = await storage.presignPut(key, body.contentType, 600);

  return NextResponse.json({
    uploadUrl: url,
    key,
    expiresInSeconds: 600,
    tempId,
  });
});

// -----------------------------------------------------------------------------
// POST /api/photos/jobs
// -----------------------------------------------------------------------------
// Called after the client has uploaded the file. Creates a job row, a
// variation row per requested variation, and enqueues a queue message.

const CreateJobSchema = z.object({
  originalKey: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string(),
  sizeBytes: z.number().int().min(1),
  width: z.number().int().nullable().optional(),
  height: z.number().int().nullable().optional(),
  presetId: z.string().optional(),
  variations: z.array(z.enum(VARIATION_KINDS as [PhotoVariationKind, ...PhotoVariationKind[]])).min(1).optional(),
  caption: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const createJob = withAuth(async (ctx) => {
  const body = CreateJobSchema.parse(await ctx.req.json());
  const orgId = ctx.org.id;
  const userId = ctx.person.id;
  const db = getDb();

  let variations: PhotoVariationKind[];
  if (body.presetId) {
    const preset = getPreset(body.presetId);
    if (!preset) throw new AppError("VALIDATION", `Unknown preset: ${body.presetId}`, 400);
    variations = preset.variations;
  } else if (body.variations) {
    variations = body.variations;
  } else {
    throw new AppError("VALIDATION", "Either presetId or variations must be provided", 400);
  }

  const jobId = `phj_${randomUUID()}`;
  const now = new Date().toISOString();
  const publicUrl = getStorage().publicUrl(body.originalKey);

  // 1) Insert the job row
  await db.insert(photoJobs).values({
    id: jobId,
    orgId,
    uploadedBy: userId,
    tenant: orgId,
    originalKey: body.originalKey,
    originalUrl: publicUrl,
    filename: body.filename,
    contentType: body.contentType,
    sizeBytes: body.sizeBytes,
    width: body.width ?? null,
    height: body.height ?? null,
    requestedVariations: variations,
    status: "queued",
    totalCostUsd: 0,
    caption: body.caption ?? null,
    notes: body.notes ?? null,
    createdAt: now,
    updatedAt: now,
  });

  // 2) Insert empty variation rows
  for (const kind of variations) {
    await db.insert(photoVariations).values({
      id: `phv_${randomUUID()}`,
      jobId,
      kind,
      key: null,
      url: null,
      sizeBytes: null,
      width: null,
      height: null,
      costUsd: null,
      durationMs: null,
      error: null,
      finishedAt: null,
    });
  }

  // 3) Enqueue the job for the worker
  // In Vercel/Next we use a queue env binding; on Cloudflare Pages we use
  // the worker's HTTP /process endpoint as a fallback.
  const queueBinding = (ctx.req as unknown as { env?: { PHOTO_JOB_QUEUE?: Queue } }).env?.PHOTO_JOB_QUEUE;
  const workerUrl = process.env.PHOTO_WORKER_URL;
  const workerToken = process.env.PHOTO_WORKER_TOKEN;

  if (queueBinding && typeof queueBinding.send === "function") {
    await queueBinding.send({
      jobId, orgId, uploadedBy: userId,
      originalKey: body.originalKey,
      requestedVariations: variations,
      caption: body.caption ?? null,
      notes: body.notes ?? null,
    });
  } else if (workerUrl) {
    // Fire and forget
    fetch(`${workerUrl}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(workerToken ? { Authorization: `Bearer ${workerToken}` } : {}) },
      body: JSON.stringify({
        jobId, orgId, uploadedBy: userId,
        originalKey: body.originalKey,
        requestedVariations: variations,
        caption: body.caption ?? null,
        notes: body.notes ?? null,
      }),
    }).catch((err) => logger.error("Failed to enqueue photo job", { jobId, err: String(err) }));
  } else {
    logger.warn("Neither PHOTO_JOB_QUEUE binding nor PHOTO_WORKER_URL set; job created but not enqueued", { jobId });
  }

  return NextResponse.json({ jobId, status: "queued", variationCount: variations.length }, { status: 201 });
});

// -----------------------------------------------------------------------------
// GET /api/photos/jobs
// -----------------------------------------------------------------------------

export const listJobs = withAuth(async (ctx) => {
  const orgId = ctx.org.id;
  const url = new URL(ctx.req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 100);
  const status = url.searchParams.get("status");
  const db = getDb();

  const whereClause = status
    ? and(eq(photoJobs.orgId, orgId), eq(photoJobs.status, status as never))
    : eq(photoJobs.orgId, orgId);

  const rows = await db.select().from(photoJobs)
    .where(whereClause)
    .orderBy(desc(photoJobs.createdAt))
    .limit(limit);

  return NextResponse.json({ jobs: rows, count: rows.length });
});

// -----------------------------------------------------------------------------
// GET /api/photos/jobs/:id
// -----------------------------------------------------------------------------

export const getJob = withAuth(async (ctx) => {
  const orgId = ctx.org.id;
  const jobId = ctx.req.nextUrl.pathname.split("/").pop()!;
  const db = getDb();

  const [job] = await db.select().from(photoJobs)
    .where(and(eq(photoJobs.id, jobId), eq(photoJobs.orgId, orgId)))
    .limit(1);
  if (!job) throw errors.notFound("Job not found");

  const variations = await db.select().from(photoVariations)
    .where(eq(photoVariations.jobId, jobId));

  return NextResponse.json({ job, variations });
});

// -----------------------------------------------------------------------------
// POST /api/photos/jobs/:id/status   (worker callback)
// -----------------------------------------------------------------------------
// This is called by the photo worker. Service-token auth, not user-session auth.

const StatusUpdateSchema = z.object({
  status: z.enum(["queued", "processing", "ready", "failed", "canceled"]),
  variations: z.array(z.object({
    kind: z.enum(VARIATION_KINDS as [PhotoVariationKind, ...PhotoVariationKind[]]),
    key: z.string().nullable(),
    url: z.string().nullable(),
    sizeBytes: z.number().nullable(),
    width: z.number().nullable(),
    height: z.number().nullable(),
    costUsd: z.number().nullable(),
    durationMs: z.number().nullable(),
    error: z.string().nullable(),
    finishedAt: z.string().nullable(),
  })).optional(),
  totalCostUsd: z.number().optional(),
});

export async function updateStatus(req: NextRequest, _ctx?: { params: Promise<Record<string, string>> }) {
  // Verify the service token
  const authHeader = req.headers.get("Authorization") ?? "";
  const expectedToken = process.env.API_SERVICE_TOKEN;
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid service token" } }, { status: 401 });
  }

  // Get jobId from path: /api/photos/jobs/:id/status
  const segments = req.nextUrl.pathname.split("/").filter(Boolean);
  // ["api", "photos", "jobs", "<jobId>", "status"]
  const jobId = segments[3];
  if (!jobId) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Missing jobId" } }, { status: 400 });
  }

  const body = StatusUpdateSchema.parse(await req.json());
  const db = getDb();
  const now = new Date().toISOString();

  await db.update(photoJobs).set({
    status: body.status,
    totalCostUsd: body.totalCostUsd ?? 0,
    finishedAt: (body.status === "ready" || body.status === "failed" || body.status === "canceled") ? now : null,
    updatedAt: now,
  }).where(eq(photoJobs.id, jobId));

  if (body.variations) {
    for (const v of body.variations) {
      await db.update(photoVariations).set({
        key: v.key,
        url: v.url,
        sizeBytes: v.sizeBytes,
        width: v.width,
        height: v.height,
        costUsd: v.costUsd,
        durationMs: v.durationMs,
        error: v.error,
        finishedAt: v.finishedAt,
      }).where(and(eq(photoVariations.jobId, jobId), eq(photoVariations.kind, v.kind)));
    }
  }

  return NextResponse.json({ ok: true });
}

// -----------------------------------------------------------------------------
// GET /api/photos/presets  (public — no auth)
// -----------------------------------------------------------------------------

export async function listPresets(req: NextRequest, _ctx?: { params: Promise<Record<string, string>> }) {
  return NextResponse.json({ presets: PRESETS });
}
