#!/usr/bin/env bash
# =============================================================================
# o.company · production deploy
# =============================================================================
# Single command. Provisions (if needed), migrates, seeds (only on first
# run, gated by a flag), and prints the URLs.
#
# Usage:
#   ./scripts/deploy.sh                       # default: vercel
#   ./scripts/deploy.sh vercel                # explicit
#   ./scripts/deploy.sh railway               # railway
#   ./scripts/deploy.sh fly                   # fly.io
#   ./scripts/deploy.sh self-hosted           # bare metal / docker
#
# Environment required (set in your shell or in a .env file):
#   DATABASE_URL               postgres://...
#   JWT_SECRET                 openssl rand -hex 64
#   ENCRYPTION_KEY             openssl rand -hex 32
#   STRIPE_SECRET_KEY          sk_live_...
#   STRIPE_WEBHOOK_SECRET      whsec_...
#   RESEND_API_KEY             re_...
#   OPENAI_API_KEY             sk-...
#   REPLICATE_API_TOKEN        ...
#   R2_ENDPOINT                https://<account>.r2.cloudflarestorage.com
#   R2_BUCKET                  o-photos
#   R2_ACCESS_KEY_ID           ...
#   R2_SECRET_ACCESS_KEY       ...
#   R2_PUBLIC_HOST             https://photos.o.company
#   API_SERVICE_TOKEN          ...
#   PHOTO_WORKER_URL           https://o-photo-worker.<account>.workers.dev
#   PHOTO_WORKER_TOKEN         ...
#
# Optional:
#   WEBHOOK_BASE_URL           https://api.o.company  (defaults to $NEXT_PUBLIC_APP_URL)
#   ALLOWED_ORIGINS            https://o.company,https://app.o.company

set -euo pipefail

PLATFORM="${1:-vercel}"

# Load .env if present
if [ -f .env ]; then
  set -a; source .env; set +a
elif [ -f .env.local ]; then
  set -a; source .env.local; set +a
fi

# Required env check
REQUIRED=(DATABASE_URL JWT_SECRET ENCRYPTION_KEY)
for v in "${REQUIRED[@]}"; do
  if [ -z "${!v:-}" ]; then
    echo "❌ $v is not set"
    echo "   export $v=..."
    exit 1
  fi
done

# Confirm intent
echo "=============================================="
echo "o.company · production deploy"
echo "=============================================="
echo "Platform:  $PLATFORM"
echo "Database:  $(echo $DATABASE_URL | sed 's/:[^@]*@/:***@/')"
echo "Workers:   ${PHOTO_WORKER_URL:-not configured}"
echo "=============================================="
echo ""
read -p "Proceed? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

# Step 1: migrate
echo ""
echo "→ Running database migrations…"
pnpm --filter @o/db migrate

# Step 2: optional seed (only if SEED_ON_DEPLOY=1)
if [ "${SEED_ON_DEPLOY:-0}" = "1" ]; then
  echo ""
  echo "→ Seeding dev data…"
  pnpm --filter @o/db seed
fi

# Step 3: platform-specific deploy
case "$PLATFORM" in
  vercel)
    echo ""
    echo "→ Deploying to Vercel…"
    if ! command -v vercel >/dev/null 2>&1; then
      echo "Installing vercel CLI…"
      npm install -g vercel
    fi
    vercel --prod
    ;;

  railway)
    echo ""
    echo "→ Deploying to Railway…"
    if ! command -v railway >/dev/null 2>&1; then
      echo "Installing railway CLI…"
      npm install -g @railway/cli
    fi
    railway up
    ;;

  fly)
    echo ""
    echo "→ Deploying to Fly.io…"
    if ! command -v fly >/dev/null 2>&1; then
      echo "Installing fly CLI…"
      curl -L https://fly.io/install.sh | sh
    fi
    fly deploy
    ;;

  self-hosted)
    echo ""
    echo "→ Self-hosted deploy…"
    pnpm build
    echo ""
    echo "Build complete. Run with:"
    echo "  pnpm start       # production server"
    echo "  pnpm --filter @o/operator-worker start    # operator runner"
    ;;

  *)
    echo "Unknown platform: $PLATFORM"
    echo "Use: vercel | railway | fly | self-hosted"
    exit 1
    ;;
esac

echo ""
echo "=============================================="
echo "✓ Deploy complete."
echo "=============================================="
echo ""
echo "Next steps:"
echo "  1. Hit /api/health on the deployed URL — should return {status: 'ok'}"
echo "  2. Set up your custom domain (o.company → Vercel)"
echo "  3. Configure Stripe webhook endpoint"
echo "  4. Send yourself a test photo upload"
echo ""
