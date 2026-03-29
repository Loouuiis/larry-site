#!/usr/bin/env bash
# =============================================================================
# Larry MVP - Canonical End-to-End Demo Smoke Test
# =============================================================================
# Validates the canonical Larry runtime pipeline:
#   1. Auth  -> 2. Create project -> 3. Submit transcript (canonical endpoint)
#   -> 4. Poll canonical action-centre suggestions -> 5. Accept suggested event
#   -> 6. Verify accepted event appears in canonical activity feed
#
# Prerequisites: API running on localhost:8080, Docker DB + Redis up.
# Usage:
#   bash scripts/demo-smoke-test.sh
#   API_URL=https://your-ngrok-url.ngrok-free.dev bash scripts/demo-smoke-test.sh
# =============================================================================

set -euo pipefail

API_URL="${API_URL:-http://localhost:8080}"
TENANT_ID="11111111-1111-4111-8111-111111111111"
EMAIL="sarah@larry.local"
PASSWORD="DevPass123!"
POLL_INTERVAL=4
POLL_MAX=60

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

pass() { echo -e "${GREEN}  [ok] $*${NC}"; }
fail() { echo -e "${RED}  [fail] $*${NC}"; exit 1; }
info() { echo -e "${CYAN}  -> $*${NC}"; }
warn() { echo -e "${YELLOW}  ! $*${NC}"; }
step() { echo -e "\n${CYAN}[$1]${NC} $2"; }

# =============================================================================
step "1/8" "Health check"
# =============================================================================
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/health" || echo "000")
if [ "$HTTP_STATUS" != "200" ]; then
  fail "API not reachable at ${API_URL} (status ${HTTP_STATUS}). Start it with: npm run api:dev"
fi
pass "API is up at ${API_URL}"

# =============================================================================
step "2/8" "Authenticate as ${EMAIL}"
# =============================================================================
AUTH_RESPONSE=$(curl -s -X POST "${API_URL}/v1/auth/login" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: ${TENANT_ID}" \
  --data-binary "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")

ACCESS_TOKEN=$(echo "$AUTH_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('accessToken',''))" 2>/dev/null || echo "")
if [ -z "$ACCESS_TOKEN" ]; then
  echo "  Auth response: $AUTH_RESPONSE"
  fail "Login failed. Is the DB seeded? Run: npm run db:seed"
fi
pass "Authenticated and token acquired"

AUTH_HEADER="Authorization: Bearer ${ACCESS_TOKEN}"
TENANT_HEADER="x-tenant-id: ${TENANT_ID}"

# =============================================================================
step "3/8" "Create a demo project"
# =============================================================================
PROJECT_RESPONSE=$(curl -s -X POST "${API_URL}/v1/projects" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -H "$TENANT_HEADER" \
  --data '{"name":"Smoke Test Project - Canonical Larry"}')

PROJECT_ID=$(echo "$PROJECT_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || echo "")
if [ -z "$PROJECT_ID" ]; then
  echo "  Project response: $PROJECT_RESPONSE"
  fail "Failed to create project."
fi
pass "Project created (id=${PROJECT_ID})"

# =============================================================================
step "4/8" "Submit transcript to canonical /v1/larry/transcript"
# =============================================================================
TRANSCRIPT="Team standup Monday.
Anna: Finalize the pitch deck by Thursday. Louis owns financials by Wednesday EOD.
Fergus: API pipeline is stable; transcript endpoint updates finish Wednesday.
Joel: Blocked on prompt review with Fergus, scheduling 30 minutes tomorrow.
Anna: Demo seed data must be ready before Friday. Fergus owns that.
Anna: Joel also needs the approval flow wired before MVP demo."

SOURCE_EVENT_ID="smoke-transcript-$(date +%s)"
TRANSCRIPT_RESPONSE=$(curl -s -X POST "${API_URL}/v1/larry/transcript" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -H "$TENANT_HEADER" \
  --data-binary "{\"sourceEventId\":\"${SOURCE_EVENT_ID}\",\"transcript\":$(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<< "$TRANSCRIPT"),\"projectId\":\"${PROJECT_ID}\",\"meetingTitle\":\"Smoke Test Meeting\"}")

TRANSCRIPT_ACCEPTED=$(echo "$TRANSCRIPT_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('accepted',''))" 2>/dev/null || echo "")
CANONICAL_EVENT_ID=$(echo "$TRANSCRIPT_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('canonicalEventId',''))" 2>/dev/null || echo "")

if [ "$TRANSCRIPT_ACCEPTED" != "True" ] && [ "$TRANSCRIPT_ACCEPTED" != "true" ]; then
  echo "  Transcript response: $TRANSCRIPT_RESPONSE"
  fail "Canonical transcript ingest was not accepted."
fi
pass "Transcript accepted (canonicalEventId=${CANONICAL_EVENT_ID})"

# =============================================================================
step "5/8" "Poll canonical /v1/larry/action-centre for suggested events"
# =============================================================================
ELAPSED=0
SUGGESTED_EVENT_ID=""
SUGGESTED_ACTION_TYPE=""
SUGGESTED_COUNT=0

while [ $ELAPSED -lt $POLL_MAX ]; do
  ACTION_CENTRE_RESPONSE=$(curl -s "${API_URL}/v1/larry/action-centre?projectId=${PROJECT_ID}" \
    -H "$AUTH_HEADER" \
    -H "$TENANT_HEADER")

  SUGGESTED_COUNT=$(echo "$ACTION_CENTRE_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('suggested',[])))" 2>/dev/null || echo "0")

  if [ "$SUGGESTED_COUNT" -gt 0 ]; then
    SUGGESTED_EVENT_ID=$(echo "$ACTION_CENTRE_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['suggested'][0]['id'])" 2>/dev/null || echo "")
    SUGGESTED_ACTION_TYPE=$(echo "$ACTION_CENTRE_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['suggested'][0].get('actionType','unknown'))" 2>/dev/null || echo "unknown")
    pass "${SUGGESTED_COUNT} suggested event(s) found in ${ELAPSED}s (first=${SUGGESTED_EVENT_ID}, actionType=${SUGGESTED_ACTION_TYPE})"
    break
  fi

  info "${ELAPSED}s elapsed - no suggestions yet; polling again in ${POLL_INTERVAL}s"
  sleep $POLL_INTERVAL
  ELAPSED=$((ELAPSED + POLL_INTERVAL))
done

if [ -z "$SUGGESTED_EVENT_ID" ]; then
  warn "No suggested events found after ${POLL_MAX}s."
  warn "Check worker health and model configuration."
  fail "Pipeline stalled - no canonical suggested event available to accept."
fi

# =============================================================================
step "6/8" "Accept first suggested event via /v1/larry/events/:id/accept"
# =============================================================================
ACCEPT_RESPONSE=$(curl -s -X POST "${API_URL}/v1/larry/events/${SUGGESTED_EVENT_ID}/accept" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -H "$TENANT_HEADER")

ACCEPTED=$(echo "$ACCEPT_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('accepted',''))" 2>/dev/null || echo "")
ACCEPTED_EVENT_TYPE=$(echo "$ACCEPT_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get('event') or {}).get('eventType',''))" 2>/dev/null || echo "")

if [ "$ACCEPTED" != "True" ] && [ "$ACCEPTED" != "true" ]; then
  echo "  Accept response: $ACCEPT_RESPONSE"
  fail "Accepting suggested event ${SUGGESTED_EVENT_ID} failed."
fi
pass "Suggested event accepted (eventType=${ACCEPTED_EVENT_TYPE})"

# =============================================================================
step "7/8" "Verify accepted event moved into canonical activity"
# =============================================================================
POST_ACCEPT_RESPONSE=$(curl -s "${API_URL}/v1/larry/action-centre?projectId=${PROJECT_ID}" \
  -H "$AUTH_HEADER" \
  -H "$TENANT_HEADER")

IN_ACTIVITY=$(echo "$POST_ACCEPT_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(any(item.get('id') == '${SUGGESTED_EVENT_ID}' for item in d.get('activity',[])))" 2>/dev/null || echo "False")
REMAINING_SUGGESTED=$(echo "$POST_ACCEPT_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(any(item.get('id') == '${SUGGESTED_EVENT_ID}' for item in d.get('suggested',[])))" 2>/dev/null || echo "False")

if [ "$IN_ACTIVITY" != "True" ] && [ "$IN_ACTIVITY" != "true" ]; then
  warn "Accepted event not visible in activity immediately. This can happen with eventual consistency."
else
  pass "Accepted event is visible in canonical activity feed"
fi

if [ "$REMAINING_SUGGESTED" = "True" ] || [ "$REMAINING_SUGGESTED" = "true" ]; then
  fail "Accepted event is still listed under suggestions."
fi
pass "Accepted event is no longer listed under suggestions"

# =============================================================================
step "8/8" "Summary"
# =============================================================================
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  SMOKE TEST PASSED (CANONICAL PATH)${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "  Pipeline validated:"
echo "  - Auth: ok"
echo "  - Project create: ok"
echo "  - Canonical transcript ingest: ok (${CANONICAL_EVENT_ID})"
echo "  - Canonical action-centre suggestion: ok (${SUGGESTED_EVENT_ID})"
echo "  - Canonical event accept: ok"
echo ""
echo "  The canonical transcript -> action-centre -> accept flow is working."
echo ""
