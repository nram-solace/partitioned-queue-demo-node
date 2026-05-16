#!/bin/sh
# Provision demo queues and topic subscription via SEMP v2 (PubSub+ Manager port).
# Defaults match README / demo.env (Demo_PQ, Demo_NQ, Demo_EQ, solace/demo/>).

set -eu

SOLACE_HOST="${SOLACE_HOST:-solace-broker}"
SEMP_PORT="${SEMP_PORT:-8080}"
MSG_VPN="${MSG_VPN:-default}"
SEMP_USER="${SEMP_USER:-admin}"
SEMP_PASS="${SEMP_PASS:-admin}"

QUEUE_PQ="${QUEUE_PQ:-Demo_PQ}"
QUEUE_NQ="${QUEUE_NQ:-Demo_NQ}"
QUEUE_EQ="${QUEUE_EQ:-Demo_EQ}"
DEMO_TOPIC_SUB="${DEMO_TOPIC_SUB:-solace/demo/>}"
PARTITION_COUNT="${PARTITION_COUNT:-8}"

# Total max wait ≈ SEMP_WAIT_MAX_ITERATIONS * SEMP_WAIT_SLEEP_SECS (default 120 * 3 = 360s)
SEMP_WAIT_MAX_ITERATIONS="${SEMP_WAIT_MAX_ITERATIONS:-120}"
SEMP_WAIT_SLEEP_SECS="${SEMP_WAIT_SLEEP_SECS:-3}"

SEMP_BASE="http://${SOLACE_HOST}:${SEMP_PORT}/SEMP/v2/config/msgVpns/${MSG_VPN}"
AUTH="${SEMP_USER}:${SEMP_PASS}"

wait_semp() {
  echo "Waiting for Solace SEMP (msgVpn ${MSG_VPN}) at ${SOLACE_HOST}:${SEMP_PORT}..."
  i=0
  while [ "$i" -lt "$SEMP_WAIT_MAX_ITERATIONS" ]; do
    if curl -sf -u "$AUTH" "${SEMP_BASE}" >/dev/null 2>&1; then
      echo "SEMP is ready."
      return 0
    fi
    i=$((i + 1))
    sleep "$SEMP_WAIT_SLEEP_SECS"
  done
  echo "SEMP did not become ready in time." >&2
  exit 1
}

# Msg-VPN can answer before queue config mutations succeed; wait for queues collection.
wait_semp_queues_api() {
  echo "Waiting for SEMP queue config API..."
  i=0
  while [ "$i" -lt "$SEMP_WAIT_MAX_ITERATIONS" ]; do
    code=$(curl -sS -o /tmp/semp_q.json -w "%{http_code}" -u "$AUTH" "${SEMP_BASE}/queues?count=1")
    if [ "$code" = "200" ]; then
      echo "SEMP queues collection ready (HTTP 200)."
      return 0
    fi
    echo "  ... GET queues?count=1 -> HTTP ${code} (retry $((i + 1))/${SEMP_WAIT_MAX_ITERATIONS})"
    i=$((i + 1))
    sleep "$SEMP_WAIT_SLEEP_SECS"
  done
  echo "SEMP queues API did not become ready in time." >&2
  exit 1
}

http_code() {
  curl -sS -o /tmp/semp_body.json -w "%{http_code}" -u "$AUTH" "$@"
}

post_json() {
  curl -sS -o /tmp/semp_body.json -w "%{http_code}" -u "$AUTH" -H "Content-Type: application/json" "$@"
}

# Retry POST/PATCH on transient broker errors (startup, replication lag).
post_json_retry() {
  max_attempts=15
  attempt=1
  delay=4
  while [ "$attempt" -le "$max_attempts" ]; do
    code=$(post_json "$@")
    if [ "$code" = "200" ]; then
      return 0
    fi
    case "$code" in
      502|503|504)
        echo "  ... transient HTTP ${code}, retry ${attempt}/${max_attempts} after ${delay}s"
        attempt=$((attempt + 1))
        sleep "$delay"
        ;;
      *)
        return 1
        ;;
    esac
  done
  return 1
}

queue_get_missing() {
  # SEMP v2 returns 404 on some releases; others return 400 + meta.error.status NOT_FOUND for unknown queue.
  [ "$1" = "404" ] || { [ "$1" = "400" ] && jq -e '.meta.error.status == "NOT_FOUND"' /tmp/semp_body.json >/dev/null 2>&1; }
}

ensure_queue() {
  name="$1"
  access="$2"
  partitions="$3"

  code=$(http_code "${SEMP_BASE}/queues/${name}")
  if queue_get_missing "$code"; then
    echo "Creating queue ${name} (accessType=${access}, partitionCount=${partitions:-0})..."
    if [ -n "$partitions" ] && [ "$partitions" != "0" ]; then
      pc=", \"partitionCount\": ${partitions}"
    else
      pc=", \"partitionCount\": 0"
    fi
    body="{\"queueName\":\"${name}\", \"accessType\":\"${access}\"${pc}, \"permission\":\"consume\", \"ingressEnabled\": true, \"egressEnabled\": true}"
    if ! post_json_retry -X POST "${SEMP_BASE}/queues" -d "$body"; then
      echo "POST queue ${name} failed after retries (last HTTP ${code}):" >&2
      cat /tmp/semp_body.json >&2
      exit 1
    fi
    return 0
  fi

  if [ "$code" != "200" ]; then
    echo "GET queue ${name} failed HTTP ${code}:" >&2
    cat /tmp/semp_body.json >&2
    exit 1
  fi

  if [ "$access" = "non-exclusive" ] && [ -n "$partitions" ] && [ "$partitions" != "0" ]; then
    cur=$(jq -r '.data.partitionCount // 0' /tmp/semp_body.json)
    if [ "$cur" != "$partitions" ]; then
      echo "Updating ${name} partitionCount ${cur} -> ${partitions}..."
      if ! post_json_retry -X PATCH "${SEMP_BASE}/queues/${name}" -d "{\"partitionCount\": ${partitions}}"; then
        echo "PATCH queue ${name} failed after retries (last HTTP ${code}):" >&2
        cat /tmp/semp_body.json >&2
        exit 1
      fi
    fi
  fi
  echo "Queue ${name} already exists (ok)."
}

ensure_subscription() {
  name="$1"
  topic="$2"

  if curl -sf -u "$AUTH" "${SEMP_BASE}/queues/${name}/subscriptions" | jq -e --arg t "$topic" '.data[] | select(.subscriptionTopic == $t)' >/dev/null 2>&1; then
    echo "Queue ${name} already subscribed to ${topic}."
    return 0
  fi

  echo "Adding subscription ${topic} on ${name}..."
  if post_json_retry -X POST "${SEMP_BASE}/queues/${name}/subscriptions" -d "{\"subscriptionTopic\":\"${topic}\"}"; then
    return 0
  fi
  if jq -e '.meta.error.status == "ALREADY_EXISTS"' /tmp/semp_body.json >/dev/null 2>&1; then
    echo "Subscription already present (ok)."
    return 0
  fi
  echo "POST subscription on ${name} failed HTTP ${code}:" >&2
  cat /tmp/semp_body.json >&2
  exit 1
}

wait_semp
wait_semp_queues_api

ensure_queue "$QUEUE_PQ" "non-exclusive" "$PARTITION_COUNT"
ensure_queue "$QUEUE_NQ" "non-exclusive" "0"
ensure_queue "$QUEUE_EQ" "exclusive" "0"

ensure_subscription "$QUEUE_PQ" "$DEMO_TOPIC_SUB"
ensure_subscription "$QUEUE_NQ" "$DEMO_TOPIC_SUB"
ensure_subscription "$QUEUE_EQ" "$DEMO_TOPIC_SUB"

echo "Solace demo queues and topic subscription are ready."
