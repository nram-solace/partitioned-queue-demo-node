#!/bin/sh
# Provision demo queues and topic subscriptions via SEMP v2.
# New profiles: add profiles/<id>.json and re-run (no script logic changes required).
# Usage:
#   ./scripts/setup-solace.sh                    # all profiles in profiles/
#   ./scripts/setup-solace.sh finance            # one profile by id
#   ./scripts/setup-solace.sh airline-carrier    # airline PQ/NQ/EQ (carrier partition keys)
#   ./scripts/setup-solace.sh airline-hub        # airline PQ/NQ/EQ (hub partition keys)

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
PROFILES_DIR="${PROFILES_DIR:-$REPO_ROOT/profiles}"

SOLACE_HOST="${SOLACE_HOST:-solace-broker}"
SEMP_PORT="${SEMP_PORT:-8080}"
MSG_VPN="${MSG_VPN:-default}"
SEMP_USER="${SEMP_USER:-admin}"
SEMP_PASS="${SEMP_PASS:-admin}"

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

wait_semp_queues_api() {
  echo "Waiting for SEMP queue config API..."
  i=0
  while [ "$i" -lt "$SEMP_WAIT_MAX_ITERATIONS" ]; do
    code=$(curl -sS -o /tmp/semp_q.json -w "%{http_code}" -u "$AUTH" "${SEMP_BASE}/queues?count=1")
    if [ "$code" = "200" ]; then
      echo "SEMP queues collection ready (HTTP 200)."
      return 0
    fi
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
      echo "POST queue ${name} failed:" >&2
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
    return 0
  fi
  echo "POST subscription on ${name} failed:" >&2
  cat /tmp/semp_body.json >&2
  exit 1
}

provision_profile_file() {
  file="$1"
  if [ ! -f "$file" ]; then
    echo "Profile file not found: $file" >&2
    exit 1
  fi

  id=$(jq -r '.id' "$file")
  topic_prefix=$(jq -r '.messaging.topicPrefix' "$file")
  pq=$(jq -r '.queues.partitioned' "$file")
  nq=$(jq -r '.queues.nonExclusive' "$file")
  eq=$(jq -r '.queues.exclusive' "$file")
  partition_count=$(jq '.messaging.partitionKeys | length' "$file")
  topic_sub="${topic_prefix}/>"

  echo "Profile ${id}: ${pq} (${partition_count} partitions), ${nq}, ${eq} → ${topic_sub}"

  ensure_queue "$pq" "non-exclusive" "$partition_count"
  ensure_queue "$nq" "non-exclusive" "0"
  ensure_queue "$eq" "exclusive" "0"

  ensure_subscription "$pq" "$topic_sub"
  ensure_subscription "$nq" "$topic_sub"
  ensure_subscription "$eq" "$topic_sub"
}

wait_semp
wait_semp_queues_api

if [ "$#" -eq 0 ]; then
  found=0
  profile_ids=""
  for f in "$PROFILES_DIR"/*.json; do
    [ -f "$f" ] || continue
    found=1
    provision_profile_file "$f"
    id=$(jq -r '.id' "$f")
    if [ -n "$profile_ids" ]; then
      profile_ids="${profile_ids}, ${id}"
    else
      profile_ids="${id}"
    fi
  done
  if [ "$found" -eq 0 ]; then
    echo "No profile JSON files in ${PROFILES_DIR}" >&2
    exit 1
  fi
  echo "Provisioned profiles: ${profile_ids}"
else
  profile_id="$1"
  matched=""
  for f in "$PROFILES_DIR"/*.json; do
    [ -f "$f" ] || continue
    if [ "$(jq -r '.id' "$f")" = "$profile_id" ]; then
      matched="$f"
      break
    fi
  done
  if [ -z "$matched" ]; then
    echo "Profile not found: ${profile_id} (looked in ${PROFILES_DIR})" >&2
    exit 1
  fi
  provision_profile_file "$matched"
fi

echo "Solace demo queues and topic subscriptions are ready."
