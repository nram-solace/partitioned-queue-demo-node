#!/bin/sh
# Push the latest code to the public demo VM and redeploy via Docker Compose.
#
# Deployment is pull-based: this script does NOT copy files directly. It SSHes
# into the VM and runs `git pull` there, so make sure your changes are pushed
# to the git remote first (git push).
#
# VM public IP is dynamic, so it's resolved via `az vm show` rather than
# hardcoded. Requires the Azure CLI logged into the subscription that owns
# the VM (`az login`).
#
# Usage:
#   ./scripts/deploy-vm.sh                # git pull + docker compose build + up -d
#   ./scripts/deploy-vm.sh --no-cache      # also: --no-cache rebuild of frontend
#   RG=... VM=... REMOTE_DIR=... SSH_USER=... ./scripts/deploy-vm.sh

set -eu

RG="${RG:-nram-dt2027-rg}"
VM="${VM:-nram-dt2027-vm}"
SSH_USER="${SSH_USER:-azureuser}"
REMOTE_DIR="${REMOTE_DIR:-/opt/queue-demo}"

NO_CACHE=0
if [ "${1:-}" = "--no-cache" ]; then
  NO_CACHE=1
fi

echo "====================================================="
echo "Resolving public IP for VM '$VM' (resource group '$RG')"
echo "====================================================="
PUBLIC_IP=$(az vm show -d -g "$RG" -n "$VM" --query publicIps -o tsv)
if [ -z "$PUBLIC_IP" ]; then
  echo "Could not resolve public IP. Is the VM running and are you logged into the right az subscription?" >&2
  exit 1
fi
echo "VM public IP: $PUBLIC_IP"

REMOTE_CMD="set -eu
cd '$REMOTE_DIR'
echo '--- git pull ---'
git pull
echo '--- docker compose build ---'"

if [ "$NO_CACHE" = "1" ]; then
  REMOTE_CMD="$REMOTE_CMD
sudo docker compose build --no-cache frontend
sudo docker compose build"
else
  REMOTE_CMD="$REMOTE_CMD
sudo docker compose build"
fi

REMOTE_CMD="$REMOTE_CMD
echo '--- docker compose up -d ---'
sudo docker compose up -d
echo '--- docker compose ps ---'
sudo docker compose ps"

echo "====================================================="
echo "Deploying on $SSH_USER@$PUBLIC_IP:$REMOTE_DIR"
echo "====================================================="
ssh "$SSH_USER@$PUBLIC_IP" "$REMOTE_CMD"

echo "====================================================="
echo "Done. Dashboard: http://$PUBLIC_IP:3000"
echo "====================================================="
