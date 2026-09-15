#!/bin/bash
# Build the Docker images locally and push them to the VM over SSH.
#
# Push-based, unlike a git-pull deploy: the VM needs no git clone, no Node
# toolchain, and no build context — only Docker. What you build and test
# locally is exactly what ships, so there's no "forgot to rebuild on the
# remote" failure mode (see docs/docker-findings.md #7).
#
# Flow:
#   1. Build partitioned-queue-demo-node:local and
#      partitioned-queue-demo-frontend:local locally, cross-compiled for the
#      VM's CPU architecture via `docker buildx` (auto-detected over SSH).
#   2. docker save each image to a gzipped tarball under tmp/docker-deploy/.
#   3. rsync/scp the tarballs + compose files + scripts/ + profiles/ to the VM.
#      demo.env and .env are treated as VM-owned runtime config and are only
#      bootstrapped (from the .example templates) if missing — never
#      overwritten, since they hold host-specific broker credentials.
#   4. SSH in: docker load both tarballs, `docker compose up -d` (brings up
#      solace-broker/solace-init if not already running), then
#      `docker compose up -d --force-recreate` on just the rebuilt services.
#
# Usage:
#   npm run deploy-vm
#   npm run deploy-vm -- --host azureuser@1.2.3.4
#   npm run deploy-vm -- --no-build       # reuse tarballs already in tmp/docker-deploy/
#   npm run deploy-vm -- --reprovision    # also re-run solace-init (bundled-broker mode)
#
# Env overrides for the default Azure target (resolved via `az vm show` when
# --host is not given): RG, VM, SSH_USER, REMOTE_DIR.

set -euo pipefail

RG="${RG:-nram-dt2027-rg}"
VM="${VM:-nram-dt2027-vm}"
SSH_USER="${SSH_USER:-azureuser}"
REMOTE_DIR="${REMOTE_DIR:-/home/azureuser/solace-queue-demo}"

HOST=""
SKIP_BUILD=false
REPROVISION=false

while [ $# -gt 0 ]; do
  case "$1" in
    --host)
      HOST="$2"; shift 2 ;;
    --no-build)
      SKIP_BUILD=true; shift ;;
    --reprovision)
      REPROVISION=true; shift ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^#//; s/^ //'; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$REPO_ROOT"

if [ -z "$HOST" ]; then
  echo "====================================================="
  echo "Resolving public IP for VM '$VM' (resource group '$RG')"
  echo "====================================================="
  PUBLIC_IP=$(az vm show -d -g "$RG" -n "$VM" --query publicIps -o tsv)
  [ -n "$PUBLIC_IP" ] || { echo "Could not resolve public IP. Is the VM running and are you logged into the right az subscription?" >&2; exit 1; }
  HOST="${SSH_USER}@${PUBLIC_IP}"
fi

echo "🔎 Checking SSH connectivity to ${HOST}..."
ssh "$HOST" 'echo ok' > /dev/null || { echo "Could not reach ${HOST} over SSH" >&2; exit 1; }

echo "🔎 Detecting remote architecture..."
REMOTE_UNAME=$(ssh "$HOST" 'uname -m')
case "$REMOTE_UNAME" in
  x86_64|amd64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) echo "Unsupported remote architecture: ${REMOTE_UNAME}" >&2; exit 1 ;;
esac
echo "   Remote arch: ${ARCH} (${REMOTE_UNAME})"

BUILD_DIR="tmp/docker-deploy"
mkdir -p "$BUILD_DIR"
BACKEND_TAR="$BUILD_DIR/backend-${ARCH}.tar.gz"
FRONTEND_TAR="$BUILD_DIR/frontend-${ARCH}.tar.gz"

if [ "$SKIP_BUILD" = true ]; then
  [ -f "$BACKEND_TAR" ] && [ -f "$FRONTEND_TAR" ] || { echo "--no-build given but ${BACKEND_TAR} / ${FRONTEND_TAR} not found. Run without --no-build first." >&2; exit 1; }
  echo "⏭️  Skipping build, using existing tarballs in ${BUILD_DIR}"
else
  echo ""
  echo "🔨 Building images for linux/${ARCH}..."
  docker buildx build --platform "linux/${ARCH}" -t partitioned-queue-demo-node:local -f Dockerfile . --load
  docker buildx build --platform "linux/${ARCH}" -t partitioned-queue-demo-frontend:local -f Dockerfile.frontend . --load

  echo "📦 Packaging images..."
  docker save partitioned-queue-demo-node:local | gzip > "$BACKEND_TAR"
  docker save partitioned-queue-demo-frontend:local | gzip > "$FRONTEND_TAR"
fi
echo ""

echo "📤 Syncing compose files, scripts/, profiles/ to ${HOST}:${REMOTE_DIR}..."
ssh "$HOST" "mkdir -p '${REMOTE_DIR}'"
rsync -az --delete scripts/ "${HOST}:${REMOTE_DIR}/scripts/"
rsync -az --delete profiles/ "${HOST}:${REMOTE_DIR}/profiles/"
scp docker-compose.yml docker-compose.apps.yml docker-compose.broker.yml docker-compose.minimal.yml compose.env.example demo.env.example "${HOST}:${REMOTE_DIR}/"

echo "📤 Copying image tarballs..."
scp "$BACKEND_TAR" "$FRONTEND_TAR" "${HOST}:${REMOTE_DIR}/"

echo ""
echo "🔧 Bootstrapping demo.env / .env on ${HOST} if missing (never overwriting existing config)..."
ssh "$HOST" bash -s << EOF
set -e
cd "${REMOTE_DIR}"
if [ ! -e demo.env ]; then
  cp demo.env.example demo.env
  echo "  Created demo.env from demo.env.example — EDIT IT with real broker settings before relying on this deploy."
fi
if [ ! -e .env ]; then
  cp compose.env.example .env
  echo "  Created .env from compose.env.example (bundled-broker profile) — edit if you want apps-only mode instead."
fi
EOF

echo ""
echo "🚀 Deploying on ${HOST}..."
ssh "$HOST" bash -s << EOF
set -e
cd "${REMOTE_DIR}"
echo "  Loading images..."
BACKEND_TAR_BASENAME="$(basename "$BACKEND_TAR")"
FRONTEND_TAR_BASENAME="$(basename "$FRONTEND_TAR")"
sudo docker load -i "\$BACKEND_TAR_BASENAME"
sudo docker load -i "\$FRONTEND_TAR_BASENAME"
rm -f "\$BACKEND_TAR_BASENAME" "\$FRONTEND_TAR_BASENAME"
echo "  Bringing up broker/init (no-op if already running)..."
sudo docker compose up -d
echo "  Recreating app containers with the new images..."
sudo docker compose up -d --force-recreate consumer publisher frontend
EOF

if [ "$REPROVISION" = true ]; then
  echo ""
  echo "🔁 Re-running solace-init (queue/topic provisioning)..."
  ssh "$HOST" "cd '${REMOTE_DIR}' && sudo docker compose run --rm solace-init && sudo docker compose up -d --force-recreate consumer publisher"
fi

echo ""
echo "====================================================="
echo "Done. Verifying..."
echo "====================================================="
ssh "$HOST" "cd '${REMOTE_DIR}' && sudo docker compose ps"

HOST_IP="${HOST#*@}"
echo ""
echo "🌐 Dashboard: http://${HOST_IP}:3000"
