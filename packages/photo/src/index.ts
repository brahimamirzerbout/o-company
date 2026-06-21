// =============================================================================
// @o/photo — domain types for the photo pipeline
// =============================================================================
// A "photo job" is one upload that produces N variations. The variations
// are a real list (upscaled 2x, color-graded "Noira", background removed,
// restored, etc.) — not a generic "AI did something to it."
//
// The pipeline is deterministic: same input + same model set = same output.
// Cost is bounded: we always know the worst case (N variations * model cost).

export const VARIATION_KINDS: PhotoVariationKind[] = [
  "original", "upscaled-2x", "upscaled-4x", "color-noira",
  "no-bg", "restored", "crop-square", "crop-portrait", "denoised",
];

export type PhotoJobStatus = "queued" | "processing" | "ready" | "failed" | "canceled";

export type PhotoVariationKind =
  | "original"      // The raw upload, untouched
  | "upscaled-2x"   // 2x resolution, same composition
  | "upscaled-4x"   // 4x resolution, same composition
  | "color-noira"   // Color-graded to the "Noira look" — warm, low-saturation, cream highlights
  | "no-bg"         // Background removed, transparent PNG
  | "restored"      // Old/photos scanned, denoised, color-corrected
  | "crop-square"   // Square crop, centered, suitable for Instagram/avatar
  | "crop-portrait" // 4:5 portrait crop, suitable for IG feed
  | "denoised";     // Low-light denoise only

export interface PhotoVariation {
  kind: PhotoVariationKind;
  /** Storage key for the result. Null while the variation is still processing. */
  key: string | null;
  /** Storage URL the client can fetch (signed). */
  url: string | null;
  /** Bytes. Null while processing. */
  sizeBytes: number | null;
  /** Width × height. Null while processing. */
  width: number | null;
  height: number | null;
  /** Cost in USD (the model charges). Null while processing. */
  costUsd: number | null;
  /** Time the variation took, in ms. Null while processing. */
  durationMs: number | null;
  /** Error message if this specific variation failed (others may succeed). */
  error: string | null;
  /** When the variation finished. */
  finishedAt: string | null;
}

export interface PhotoJob {
  id: string;
  orgId: string;
  /** Who uploaded it. */
  uploadedBy: string;
  /** Tenant key prefix in storage. Usually equals orgId. */
  tenant: string;

  /** Original file metadata. */
  original: {
    key: string;
    url: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    width: number | null;
    height: number | null;
  };

  /** Which variations were requested. */
  requestedVariations: PhotoVariationKind[];

  /** Status of the overall job. */
  status: PhotoJobStatus;

  /** Per-variation results. */
  variations: PhotoVariation[];

  /** Total cost across all variations. */
  totalCostUsd: number;

  /** Client-visible caption / context (e.g. "Quanta brand photos, batch 3"). */
  caption: string | null;

  /** Free-form notes. */
  notes: string | null;

  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

// =============================================================================
// Variation presets — what the client picks from in the UI
// =============================================================================

export interface VariationPreset {
  id: string;
  label: string;
  description: string;
  variations: PhotoVariationKind[];
  /** Per-job cost in USD, before any markup. */
  costUsd: number;
}

export const PRESETS: VariationPreset[] = [
  {
    id: "social-square",
    label: "Social square",
    description: "Square crop + Noira color grade. Ready for Instagram, LinkedIn, avatar.",
    variations: ["crop-square", "color-noira"],
    costUsd: 0.12,
  },
  {
    id: "portrait-feed",
    label: "Portrait feed",
    description: "4:5 portrait crop + color grade. For Instagram feed posts.",
    variations: ["crop-portrait", "color-noira"],
    costUsd: 0.12,
  },
  {
    id: "print-2x",
    label: "Print 2x",
    description: "2x upscale + restoration. For physical prints and large displays.",
    variations: ["upscaled-2x", "denoised"],
    costUsd: 0.18,
  },
  {
    id: "product-shot",
    label: "Product shot",
    description: "Background removed + 2x upscale. For product cards, marketplaces.",
    variations: ["no-bg", "upscaled-2x", "color-noira"],
    costUsd: 0.22,
  },
  {
    id: "restore-old",
    label: "Restore old",
    description: "Denoise + color correction + 2x upscale. For scanned prints and old photos.",
    variations: ["restored", "upscaled-2x"],
    costUsd: 0.25,
  },
  {
    id: "full-set",
    label: "Full set",
    description: "Everything we do. 8 variations. The 'just give me the whole thing' option.",
    variations: ["crop-square", "crop-portrait", "color-noira", "no-bg", "denoised", "restored", "upscaled-2x", "upscaled-4x"],
    costUsd: 0.65,
  },
];

export function getPreset(id: string): VariationPreset | null {
  return PRESETS.find((p) => p.id === id) ?? null;
}
