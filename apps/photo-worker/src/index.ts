// =============================================================================
// o.company · photo worker
// =============================================================================
// Runs on Cloudflare Workers. Receives a job from the API queue, fetches
// the original from R2, runs all the requested variations in parallel,
// uploads the results to R2, and reports back to the API.
//
// This is the heart of the photo pipeline. Everything else is plumbing.

import { registerAllModels, getModel, PhotoVariation, PhotoVariationKind, PhotoJob, PRESETS, getPreset } from "@o/photo";
import { cropImage, probeImage } from "@o/photo/image-ops";

// Register all model adapters on first import
registerAllModels();

export interface Env {
  // R2 binding (configured in wrangler.toml)
  PHOTOS: R2Bucket;
  // R2 public host for serving the result (Cloudflare CDN)
  R2_PUBLIC_HOST: string;
  // Replicate API token
  REPLICATE_API_TOKEN: string;
  // The API base URL (we call back to update job status)
  API_BASE_URL: string;
  API_SERVICE_TOKEN: string;
  // Queue bindings
  PHOTO_JOB_QUEUE: Queue;
}

interface QueueMessage {
  jobId: string;
  orgId: string;
  uploadedBy: string;
  originalKey: string;
  requestedVariations: PhotoVariationKind[];
  caption: string | null;
  notes: string | null;
}

export default {
  // HTTP entrypoint — used for health checks and manual re-runs
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname === "/process" && request.method === "POST") {
      const body = await request.json() as QueueMessage;
      const result = await processJob(env, body);
      return Response.json(result, { status: result.status === "failed" ? 500 : 200 });
    }
    return new Response("Not found", { status: 404 });
  },

  // Queue consumer — the real entrypoint
  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        await processJob(env, msg.body);
        msg.ack();
      } catch (err) {
        console.error(`Job ${msg.body.jobId} crashed:`, err);
        // Retry up to 3 times. Cloudflare will redeliver.
        msg.retry();
      }
    }
  },
} satisfies ExportedHandler<Env>;

// =============================================================================
// processJob — the main pipeline
// =============================================================================

async function processJob(env: Env, msg: QueueMessage) {
  const t0 = Date.now();
  console.log(`[photo] job=${msg.jobId} start`);

  // 1) Fetch the original from R2
  const originalObj = await env.PHOTOS.get(msg.originalKey);
  if (!originalObj) throw new Error(`Original ${msg.originalKey} not found in R2`);
  const originalBytes = new Uint8Array(await originalObj.arrayBuffer());
  const probe = await probeImage(originalBytes);
  console.log(`[photo] job=${msg.jobId} original=${probe.width}x${probe.height} ${probe.contentType}`);

  // 2) Report "processing" to the API
  await reportStatus(env, msg.jobId, "processing", null);

  // 3) Run all variations in parallel
  const variationPromises = msg.requestedVariations.map((kind) =>
    runVariation(env, msg.jobId, kind, originalBytes, probe.contentType, probe.width, probe.height)
      .then((v) => v)
      .catch((err) => ({
        kind,
        key: null,
        url: null,
        sizeBytes: null,
        width: null,
        height: null,
        costUsd: null,
        durationMs: null,
        error: err instanceof Error ? err.message : String(err),
        finishedAt: new Date().toISOString(),
      } as PhotoVariation))
  );
  const variations = await Promise.all(variationPromises);

  const totalCost = variations.reduce((a, v) => a + (v.costUsd ?? 0), 0);
  const anyFailed = variations.some((v) => v.error !== null && v.key === null);
  const allFailed = variations.every((v) => v.error !== null && v.key === null);
  const status = allFailed ? "failed" : anyFailed ? "ready" : "ready"; // partial → still ready

  // 4) Report final state
  await reportStatus(env, msg.jobId, status, { variations, totalCostUsd: totalCost });

  console.log(
    `[photo] job=${msg.jobId} done in ${Date.now() - t0}ms ` +
    `(${variations.filter((v) => v.key !== null).length}/${variations.length} succeeded, $${totalCost.toFixed(4)})`,
  );

  return { jobId: msg.jobId, status, totalCostUsd: totalCost, durationMs: Date.now() - t0 };
}

// =============================================================================
// runVariation — run one variation, upload result, return its record
// =============================================================================

async function runVariation(
  env: Env,
  jobId: string,
  kind: PhotoVariationKind,
  originalBytes: Uint8Array,
  originalContentType: string,
  width: number,
  height: number,
): Promise<PhotoVariation> {
  const t0 = Date.now();
  const adapter = getModel(kind);
  if (!adapter) {
    return {
      kind,
      key: null, url: null, sizeBytes: null, width: null, height: null,
      costUsd: null, durationMs: null,
      error: `No model adapter registered for "${kind}"`,
      finishedAt: new Date().toISOString(),
    };
  }

  try {
    // 1) Run the model
    const output = await adapter.run({
      bytes: originalBytes,
      contentType: originalContentType,
      width, height,
    });

    // 2) Upload to R2
    const outKey = `${jobId}/${kind}.${output.contentType.split("/")[1] ?? "jpg"}`;
    await env.PHOTOS.put(outKey, output.bytes, {
      httpMetadata: { contentType: output.contentType },
      customMetadata: {
        jobId,
        kind,
        costUsd: String(output.costUsd),
        durationMs: String(output.durationMs),
      },
    });

    // 3) Build the public URL
    const url = `${env.R2_PUBLIC_HOST.replace(/\/$/, "")}/${outKey}`;

    return {
      kind,
      key: outKey,
      url,
      sizeBytes: output.bytes.byteLength,
      width: output.width,
      height: output.height,
      costUsd: output.costUsd,
      durationMs: Date.now() - t0,
      error: null,
      finishedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      kind,
      key: null, url: null, sizeBytes: null, width: null, height: null,
      costUsd: null, durationMs: null,
      error: err instanceof Error ? err.message : String(err),
      finishedAt: new Date().toISOString(),
    };
  }
}

// =============================================================================
// reportStatus — call the API back with progress / completion
// =============================================================================

async function reportStatus(
  env: Env,
  jobId: string,
  status: "queued" | "processing" | "ready" | "failed" | "canceled",
  payload: { variations: PhotoVariation[]; totalCostUsd: number } | null,
) {
  const res = await fetch(`${env.API_BASE_URL}/api/photos/jobs/${jobId}/status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.API_SERVICE_TOKEN}`,
    },
    body: JSON.stringify({ status, ...payload }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`Status report failed for job ${jobId}: ${res.status} ${text}`);
  }
}
