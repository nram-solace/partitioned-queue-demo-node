SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
LOG_DIR="$REPO_ROOT/logs"
mkdir -p "$LOG_DIR"

echo "========================================"
echo "Running frontend"
echo "========================================"
npm run frontend > "$LOG_DIR/frontend.out" 2>&1 &
sleep 10

echo "========================================"
echo "Running consumer"
echo "========================================"
npm run consumer > "$LOG_DIR/consumer.out" 2>&1 &
sleep 5

echo "========================================"
echo "Running publisher"
echo "========================================"
npm run publisher > "$LOG_DIR/publisher.out" 2>&1 &
sleep 2
