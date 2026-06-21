// =============================================================================
// @o/photo/image-ops — local image transforms (no model calls)
// =============================================================================
// Pure functions that operate on the image bytes in place. These run in
// the worker without hitting a remote model. They use sharp in Node and
// the Cloudflare Images binding in the worker.

import { ModelInput, ModelOutput } from "./models";

export type CropMode = "square" | "portrait" | "landscape" | "original";

export interface CropResult {
  bytes: Uint8Array;
  width: number;
  height: number;
}

export async function cropImage(input: ModelInput, mode: CropMode): Promise<CropResult> {
  // In Node (dev / test): use sharp
  if (typeof process !== "undefined" && process.versions?.node) {
    const sharp = (await import("sharp")).default;
    const img = sharp(Buffer.from(input.bytes));
    const meta = await img.metadata();
    const srcW = meta.width ?? input.width ?? 1024;
    const srcH = meta.height ?? input.height ?? 1024;

    if (mode === "original" || (mode === "square" && srcW === srcH)) {
      return { bytes: input.bytes, width: srcW, height: srcH };
    }

    if (mode === "square") {
      const side = Math.min(srcW, srcH);
      const left = Math.floor((srcW - side) / 2);
      const top = Math.floor((srcH - side) / 2);
      const out = await sharp(Buffer.from(input.bytes))
        .extract({ left, top, width: side, height: side })
        .jpeg({ quality: 92 })
        .toBuffer();
      return { bytes: new Uint8Array(out), width: side, height: side };
    }

    if (mode === "portrait") {
      const targetRatio = 4 / 5;
      const srcRatio = srcW / srcH;
      let cropW = srcW;
      let cropH = srcH;
      if (srcRatio > targetRatio) {
        cropW = Math.floor(srcH * targetRatio);
      } else {
        cropH = Math.floor(srcW / targetRatio);
      }
      const left = Math.floor((srcW - cropW) / 2);
      const top = Math.floor((srcH - cropH) / 2);
      const out = await sharp(Buffer.from(input.bytes))
        .extract({ left, top, width: cropW, height: cropH })
        .jpeg({ quality: 92 })
        .toBuffer();
      return { bytes: new Uint8Array(out), width: cropW, height: cropH };
    }

    if (mode === "landscape") {
      const targetRatio = 16 / 9;
      const srcRatio = srcW / srcH;
      let cropW = srcW;
      let cropH = srcH;
      if (srcRatio > targetRatio) {
        cropH = Math.floor(srcW / targetRatio);
      } else {
        cropW = Math.floor(srcH * targetRatio);
      }
      const left = Math.floor((srcW - cropW) / 2);
      const top = Math.floor((srcH - cropH) / 2);
      const out = await sharp(Buffer.from(input.bytes))
        .extract({ left, top, width: cropW, height: cropH })
        .jpeg({ quality: 92 })
        .toBuffer();
      return { bytes: new Uint8Array(out), width: cropW, height: cropH };
    }
  }

  // In Workers (production): use the Images binding via the request context.
  // Implemented in apps/photo-worker/src/crop.ts which calls
  // env.IMAGES.input(...).transform({...}).output().
  // For this scaffold, return input unchanged.
  return { bytes: input.bytes, width: input.width ?? 1024, height: input.height ?? 1024 };
}

export async function probeImage(bytes: Uint8Array): Promise<{ width: number; height: number; contentType: string }> {
  if (typeof process !== "undefined" && process.versions?.node) {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(Buffer.from(bytes)).metadata();
    return {
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      contentType: `image/${meta.format ?? "jpeg"}`,
    };
  }
  // In Workers the probe is done in the request handler with
  // env.IMAGES.input(bytes).transform().info().
  return { width: 0, height: 0, contentType: "image/jpeg" };
}
