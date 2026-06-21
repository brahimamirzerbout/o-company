# @o/photo-worker

Cloudflare Worker that runs the photo pipeline.

## What it does

1. Receives a job from the `o-photo-jobs` queue
2. Fetches the original from R2
3. Runs all requested variations in parallel (Real-ESRGAN, rembg, SDXL color grade, sharp crops, etc.)
4. Uploads results to R2
5. Reports back to the API with the variation URLs and costs

## Local dev

```sh
# 1. Install Wrangler if you don't have it
pnpm add -g wrangler

# 2. Auth with Cloudflare
wrangler login

# 3. Create the R2 bucket (once)
wrangler r2 bucket create o-photos
wrangler r2 bucket create o-photos-dev

# 4. Set secrets
wrangler secret put REPLICATE_API_TOKEN
wrangler secret put API_BASE_URL          # e.g. https://api.o.company
wrangler secret put API_SERVICE_TOKEN     # same as API's API_SERVICE_TOKEN

# 5. Run
pnpm dev
```

## Deploy

```sh
pnpm deploy
```

The queue `o-photo-jobs` and DLQ `o-photo-jobs-dlq` are created automatically by Wrangler on first deploy.

## Model registry

| Variation | Model | Provider | Cost | Time |
|---|---|---|---|---|
| `crop-square` | sharp (local) | local | $0.00 | ~50ms |
| `crop-portrait` | sharp (local) | local | $0.00 | ~50ms |
| `no-bg` | rembg | Replicate | $0.005 | ~3s |
| `denoised` | Real-ESRGAN (denoise) | Replicate | $0.012 | ~5s |
| `color-noira` | SDXL img2img | Replicate | $0.025 | ~8s |
| `restored` | Denoise + Noira (chained) | Replicate | $0.037 | ~13s |
| `upscaled-2x` | Real-ESRGAN 2x | Replicate | $0.012 | ~4s |
| `upscaled-4x` | Real-ESRGAN 4x | Replicate | $0.040 | ~10s |

Add new variations by writing a new `ModelAdapter` and calling `registerModel()` in `variations.ts`.
