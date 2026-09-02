#!/bin/bash
# Fetch Cloudflare Workers Observability logs for examanet-poc
# Usage: ./scripts/cf-logs.sh [minutes] [limit]
# Default: 60 minutes, 50 events

set -e
set -a
source .env.local
set +a

MINUTES="${1:-60}"
LIMIT="${2:-50}"
SCRIPT_NAME="${3:-examanet-poc}"

NOW=$(date +%s)
PAST=$((NOW - MINUTES * 60))

echo "=== Cloudflare Workers Observability Logs ==="
echo "Service: $SCRIPT_NAME"
echo "Timeframe: last $MINUTES minutes (from $(date -d @$PAST) to now)"
echo "Limit: $LIMIT events"
echo ""

# Filter by error level + the script
FILTER='[
  {"key": "$metadata.service", "operation": "eq", "type": "string", "value": "'$SCRIPT_NAME'"},
  {"key": "level", "operation": "eq", "type": "string", "value": "error"}
]'

# Get error events
echo "--- ERROR EVENTS ---"
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/observability/telemetry/query" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "queryId": "cf-logs-error-'$RANDOM'",
    "timeframe": { "from": '${PAST}'000, "to": '${NOW}'000 },
    "parameters": {
      "datasets": ["cloudflare-workers"],
      "filters": [
        { "key": "$metadata.service", "operation": "eq", "type": "string", "value": "'$SCRIPT_NAME'" },
        { "key": "level", "operation": "eq", "type": "string", "value": "error" }
      ],
      "calculations": [],
      "groupBys": [],
      "havings": []
    },
    "view": "events",
    "limit": '$LIMIT'
  }' | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    events = data.get('result', {}).get('events', {}).get('events', [])
    print(f'Found {len(events)} error events')
    print('')
    for e in events:
        source = e.get('source', {})
        msg = source.get('message', source.get('error', ''))
        ts = e.get('timestamp', 0)
        import datetime
        dt = datetime.datetime.fromtimestamp(ts / 1000).strftime('%Y-%m-%d %H:%M:%S')
        meta = e.get('\$metadata', {})
        print(f'[{dt}] {meta.get(\"level\", \"?\")} {meta.get(\"trigger\", \"?\")}')
        print(f'  msg: {msg[:200]}')
        if 'error' in source:
            err = source['error']
            # Just show the relevant lines
            for line in err.split('\n')[:5]:
                if 'instantiateLibrary' in line or 'getCurrentBinaryTarget' in line or 'readdir' in line or 'unenv' in line:
                    print(f'  >>> {line.strip()[:150]}')
        print('')
except Exception as ex:
    print(f'Error: {ex}')
    print(sys.stdin.read()[:500])
"

# Get all events
echo ""
echo "--- ALL EVENTS (last $LIMIT) ---"
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/observability/telemetry/query" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "queryId": "cf-logs-all-'$RANDOM'",
    "timeframe": { "from": '${PAST}'000, "to": '${NOW}'000 },
    "parameters": {
      "datasets": ["cloudflare-workers"],
      "filters": [
        { "key": "$metadata.service", "operation": "eq", "type": "string", "value": "'$SCRIPT_NAME'" }
      ],
      "calculations": [],
      "groupBys": [],
      "havings": []
    },
    "view": "events",
    "limit": '$LIMIT'
  }' | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    events = data.get('result', {}).get('events', {}).get('events', [])
    print(f'Found {len(events)} events')
    print('')
    for e in events:
        source = e.get('source', {})
        msg = source.get('message', source.get('error', ''))[:150]
        ts = e.get('timestamp', 0)
        import datetime
        dt = datetime.datetime.fromtimestamp(ts / 1000).strftime('%H:%M:%S')
        meta = e.get('\$metadata', {})
        print(f'[{dt}] [{meta.get(\"level\", \"?\")}] {msg}')
except Exception as ex:
    print(f'Error: {ex}')
    print(sys.stdin.read()[:500])
"
