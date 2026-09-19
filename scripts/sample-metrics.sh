#!/usr/bin/env bash
# Polls per-container CPU/RAM (docker stats) + host swap (free -h) + Postgres
# connection count at a fixed interval, appending one row per container per
# sample to a CSV. Meant to run on the staging VPS itself (or on a dev
# machine pointed at the local stack) for the duration of a k6 run.
#
# Usage: ./scripts/sample-metrics.sh [interval_seconds] [output_csv]
#   POSTGRES_CONTAINER env var overrides the container name used for the
#   pg_stat_activity query (default: yoyo-staging-postgres-1, matching
#   docker-compose.staging.yml's "yoyo-staging" project name).
#   NAME_FILTER env var overrides the docker stats name filter
#   (default: yoyo-staging, so this only samples the staging stack even if
#   local dev containers are running on the same host).
set -euo pipefail

INTERVAL_SECONDS="${1:-5}"
OUTPUT_CSV="${2:-load-test/results/metrics.csv}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-yoyo-staging-postgres-1}"
NAME_FILTER="${NAME_FILTER:-yoyo-staging}"

# Converts a docker-stats-style size like "123.4MiB" or "3.8GiB" to a plain MiB number.
to_mib() {
  awk -v s="$1" 'BEGIN {
    if (s ~ /GiB$/) { gsub(/GiB$/, "", s); printf "%.1f", s * 1024 }
    else { gsub(/MiB$/, "", s); printf "%.1f", s }
  }'
}

mkdir -p "$(dirname "$OUTPUT_CSV")"
if [ ! -f "$OUTPUT_CSV" ]; then
  echo "timestamp,container,cpu_percent,mem_used_mib,mem_limit_mib,mem_percent,swap_used_mib,swap_total_mib,pg_connections" > "$OUTPUT_CSV"
fi

echo "Sampling every ${INTERVAL_SECONDS}s into ${OUTPUT_CSV} (Ctrl+C to stop)"

while true; do
  timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  if command -v free >/dev/null 2>&1; then
    swap_line="$(free -m | awk '/Swap:/ {print $3","$2}')"
  else
    swap_line="n/a,n/a"
  fi

  pg_connections="n/a"
  if docker inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1; then
    pg_connections="$(docker exec "$POSTGRES_CONTAINER" psql -U "${POSTGRES_USER:-yoyo}" -d "${POSTGRES_DB:-yoyo}" -t -A -c "select count(*) from pg_stat_activity;" 2>/dev/null || echo "n/a")"
  fi

  docker stats --no-stream --format "{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}}" \
    | { grep "$NAME_FILTER" || true; } \
    | while IFS=, read -r name cpu memusage mempercent; do
        cpu_percent="${cpu%\%}"
        mem_percent="${mempercent%\%}"
        # MemUsage looks like "123.4MiB / 3.8GiB" - split and normalize both sides to MiB.
        mem_used_raw="$(echo "$memusage" | awk -F' / ' '{print $1}')"
        mem_limit_raw="$(echo "$memusage" | awk -F' / ' '{print $2}')"
        mem_used_mib="$(to_mib "$mem_used_raw")"
        mem_limit_mib="$(to_mib "$mem_limit_raw")"
        echo "${timestamp},${name},${cpu_percent},${mem_used_mib},${mem_limit_mib},${mem_percent},${swap_line},${pg_connections}" >> "$OUTPUT_CSV"
      done

  sleep "$INTERVAL_SECONDS"
done
