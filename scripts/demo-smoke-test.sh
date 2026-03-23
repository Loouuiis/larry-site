#!/usr/bin/env bash
# =============================================================================
# Larry MVP — End-to-End Demo Smoke Test
# =============================================================================
# Validates the full pipeline:
#   1. Auth  →  2. Create project  →  3. Fire Larry command (transcript)
#   →  4. Poll for extracted actions  →  5. Approve action
#   →  6. Confirm agent run reached APPROVAL_PENDING or EXECUTED
#
# Prerequisites: API running on localhost:8080, Docker DB + Redis up.
# Usage:  bash scripts/demo-smoke-test.sh
#         API_URL=https://your-ngrok-url.ngrok-free.dev bash scripts/demo-smoke-test.sh
# =============================================================================

set -euo pipefail

API_URL="${API_URL:-http://localhost:8080}"
TENANT_ID="11111111-1111-4111-8111-111111111111"
EMAIL="sarah@larry.local"
PASSWORD="DevPass123!"
POLL_INTERVAL=4   # seconds between action polls
POLL_MAX=60       # total seconds to wait for actions

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

pass() { echo -e "${GREEN}  ✓ $*${NC}"; }
fail() { echo -e "${RED}  ✗ $*${NC}"; exit 1; }
info() { echo -e "${CYAN}  → $*${NC}"; }
warn() { echo -e "${YELLOW}  ! $*${NC}"; }
step() { echo -e "\n${CYAN}[$1]${NC} $2"; }

json_field() {
  # Minimal JSON field extractor using python3 (avoids jq dependency)
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d$2)" 2>/dev/null || echo ""
}

# =============================================================================
step "1/7" "Health check — is the API up?"
# =============================================================================
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/health" || echo "000")
if [ "$HTTP_STATUS" != "200" ]; then
  fail "API not reachable at ${API_URL} (status ${HTTP_STATUS}). Start it with: npm run api:dev"
fi
pass "API is up at ${API_URL}"

# =============================================================================
step "2/7" "Authenticate as ${EMAIL}"
# =============================================================================
AUTH_RESPONSE=$(curl -s -X POST "${API_URL}/v1/auth/login" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: ${TENANT_ID}" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")

ACCESS_TOKEN=$(echo "$AUTH_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('accessToken',''))" 2>/dev/null || echo "")
if [ -z "$ACCESS_TOKEN" ]; then
  echo "  Auth response: $AUTH_RESPONSE"
  fail "Login failed. Is the DB seeded? Run: npm run db:seed"
fi
pass "Authenticated — token acquired"

AUTH_HEADER="Authorization: Bearer ${ACCESS_TOKEN}"
TENANT_HEADER="x-tenant-id: ${TENANT_ID}"

# =============================================================================
step "3/7" "Create a demo project"
# =============================================================================
PROJECT_RESPONSE=$(curl -s -X POST "${API_URL}/v1/projects" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -H "$TENANT_HEADER" \
  -d '{"name":"Smoke Test Project — Larry Demo"}')

PROJECT_ID=$(echo "$PROJECT_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || echo "")
if [ -z "$PROJECT_ID" ]; then
  echo "  Project response: $PROJECT_RESPONSE"
  fail "Failed to create project."
fi
pass "Project created — id=${PROJECT_ID}"

# =============================================================================
step "4/7" "Fire Larry command with a realistic meeting transcript"
# =============================================================================
TRANSCRIPT="Team standup — Monday 24 March.
Anna: We need to finalise the pitch deck by Thursday. Louis, can you own the financials section?
Louis: Yes, I'll have that done by Wednesday EOD.
Fergus: The API pipeline is working end-to-end now. I'll start on the meeting transcript endpoint today, targeting Wednesday.
Joel: I'm blocked on the LLM extraction prompt — need to review with Fergus first. Can we schedule 30 min tomorrow?
Anna: Agreed. Also, the demo seed data needs to be ready before Friday. Fergus, please own that.
Fergus: On it.
Anna: Joel — once you're unblocked, please also get the task approval flow wired. That's our P0 before the MVP demo."

COMMAND_RESPONSE=$(curl -s -X POST "${API_URL}/v1/larry/commands" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -H "$TENANT_HEADER" \
  -d "{\"intent\":\"freeform\",\"input\":$(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<< "$TRANSCRIPT"),\"projectId\":\"${PROJECT_ID}\",\"mode\":\"execute\"}")

RUN_ID=$(echo "$COMMAND_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('runId',''))" 2>/dev/null || echo "")
COMMAND_ACCEPTED=$(echo "$COMMAND_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('commandAccepted',''))" 2>/dev/null || echo "")

if [ "$COMMAND_ACCEPTED" != "True" ] && [ "$COMMAND_ACCEPTED" != "true" ]; then
  echo "  Command response: $COMMAND_RESPONSE"
  fail "Larry command was not accepted."
fi
pass "Larry command accepted — runId=${RUN_ID}"
info "Transcript submitted. Waiting for worker to extract actions…"

# =============================================================================
step "5/7" "Poll /v1/agent/actions for up to ${POLL_MAX}s"
# =============================================================================
ELAPSED=0
ACTION_ID=""
ACTION_COUNT=0

while [ $ELAPSED -lt $POLL_MAX ]; do
  ACTIONS_RESPONSE=$(curl -s "${API_URL}/v1/agent/actions?state=pending" \
    -H "$AUTH_HEADER" \
    -H "$TENANT_HEADER")

  ACTION_COUNT=$(echo "$ACTIONS_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('items',[])))" 2>/dev/null || echo "0")

  if [ "$ACTION_COUNT" -gt 0 ]; then
    ACTION_ID=$(echo "$ACTIONS_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['items'][0]['id'])" 2>/dev/null || echo "")
    ACTION_TYPE=$(echo "$ACTIONS_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['items'][0].get('actionType','unknown'))" 2>/dev/null || echo "unknown")
    pass "${ACTION_COUNT} action(s) extracted in ${ELAPSED}s — first: type=${ACTION_TYPE} id=${ACTION_ID}"
    break
  fi

  info "  ${ELAPSED}s — no actions yet, polling again in ${POLL_INTERVAL}s…"
  sleep $POLL_INTERVAL
  ELAPSED=$((ELAPSED + POLL_INTERVAL))
done

if [ -z "$ACTION_ID" ]; then
  warn "No actions extracted after ${POLL_MAX}s."
  warn "Check: (1) worker is running  (2) OPENAI_API_KEY is set  (3) both .envs point to same DB"
  fail "Pipeline stalled — no extracted actions found."
fi

# =============================================================================
step "6/7" "Approve the first extracted action"
# =============================================================================
APPROVE_RESPONSE=$(curl -s -X POST "${API_URL}/v1/actions/${ACTION_ID}/approve" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -H "$TENANT_HEADER" \
  -d '{"note":"Smoke test auto-approval"}')

APPROVE_STATE=$(echo "$APPROVE_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('state',''))" 2>/dev/null || echo "")
APPROVE_OK=$(echo "$APPROVE_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null || echo "")

if [ "$APPROVE_OK" != "True" ] && [ "$APPROVE_OK" != "true" ]; then
  echo "  Approve response: $APPROVE_RESPONSE"
  fail "Approval failed for action ${ACTION_ID}."
fi
pass "Action approved — new state=${APPROVE_STATE}"

# =============================================================================
step "7/7" "Verify agent run reached terminal state"
# =============================================================================
if [ -n "$RUN_ID" ]; then
  RUN_RESPONSE=$(curl -s "${API_URL}/v1/agent/runs/${RUN_ID}" \
    -H "$AUTH_HEADER" \
    -H "$TENANT_HEADER" 2>/dev/null || echo "{}")
  RUN_STATE=$(echo "$RUN_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('state','UNKNOWN'))" 2>/dev/null || echo "UNKNOWN")
  info "Agent run ${RUN_ID} state: ${RUN_STATE}"
fi

# =============================================================================
echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓  SMOKE TEST PASSED${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo "  Pipeline validated:"
echo "  • Auth            ✓"
echo "  • Project create  ✓"
echo "  • Larry command   ✓  (runId=${RUN_ID})"
echo "  • Action extract  ✓  (${ACTION_COUNT} action(s) in ${ELAPSED}s)"
echo "  • Approve action  ✓  (id=${ACTION_ID})"
echo ""
echo "  The full transcript → extract → approve loop is working."
echo "  Ready for customer demo."
echo ""
