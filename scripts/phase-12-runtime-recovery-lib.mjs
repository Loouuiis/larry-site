export const PHASE_12_BULK_CONFIRM_TOKEN = "phase-12-runtime-recovery";
export const DEFAULT_RUNTIME_LIST_LIMIT = 25;
export const MAX_RUNTIME_LIST_LIMIT = 100;
export const DEFAULT_RUNTIME_BULK_STATUS = "all";
export const DEFAULT_API_BASE_URL = "http://localhost:8080";

const VALID_STATUSES = new Set(["running", "succeeded", "retryable_failed", "dead_lettered"]);
const VALID_BULK_STATUSES = new Set(["all", "retryable_failed", "dead_lettered"]);
const VALID_SOURCES = new Set(["slack", "email", "calendar", "transcript"]);

function readFlagValue(token, next) {
  if (!next || next.startsWith("--")) {
    throw new Error(`Missing required value for ${token}`);
  }
  return next;
}

function parseLimit(raw, flagName = "--limit") {
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`Invalid ${flagName} value: ${raw}`);
  }
  if (value < 1 || value > MAX_RUNTIME_LIST_LIMIT) {
    throw new Error(
      `${flagName} must be between 1 and ${MAX_RUNTIME_LIST_LIMIT} (received ${raw})`
    );
  }
  return value;
}

function assertUuid(value, flagName) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Invalid ${flagName} value: ${value}`);
  }
}

function assertEnum(value, allowed, flagName) {
  if (!allowed.has(value)) {
    throw new Error(`Invalid ${flagName} value: ${value}`);
  }
}

export function getPhase12RuntimeRecoveryUsage() {
  return `Usage:
  node scripts/phase-12-runtime-recovery.mjs list [--status <status>] [--source <source>] [--limit <n>]
  node scripts/phase-12-runtime-recovery.mjs retry --id <uuid> [--reason <text>]
  node scripts/phase-12-runtime-recovery.mjs bulk [--status <status>] [--source <source>] [--limit <n>] [--reason <text>] [--execute --confirm ${PHASE_12_BULK_CONFIRM_TOKEN}]

Commands:
  list   List canonical event runtime reliability entries.
  retry  Queue one canonical event retry.
  bulk   Queue bounded bulk retries. Dry-run by default.

Flags:
  --status   list: running|succeeded|retryable_failed|dead_lettered
             bulk: all|retryable_failed|dead_lettered (default: all)
  --source   slack|email|calendar|transcript
  --limit    1-${MAX_RUNTIME_LIST_LIMIT} (default: ${DEFAULT_RUNTIME_LIST_LIMIT})
  --reason   Optional operator reason for audit metadata.
  --execute  Required for destructive bulk enqueue (otherwise dry-run preview only).
  --confirm  Must equal ${PHASE_12_BULK_CONFIRM_TOKEN} when --execute is set.

Environment:
  LARRY_API_BASE_URL    API base URL (default: ${DEFAULT_API_BASE_URL})
  LARRY_API_TENANT_ID   Service login tenant id (required)
  LARRY_API_EMAIL       Service login email (required)
  LARRY_API_PASSWORD    Service login password (required)
`;
}

export function parsePhase12RuntimeRecoveryArgs(argv) {
  const command = argv[0];
  if (!command || !["list", "retry", "bulk"].includes(command)) {
    throw new Error("First argument must be one of: list, retry, bulk");
  }

  const args = {
    command,
    status: command === "bulk" ? DEFAULT_RUNTIME_BULK_STATUS : null,
    source: null,
    limit: DEFAULT_RUNTIME_LIST_LIMIT,
    canonicalEventId: null,
    reason: null,
    execute: false,
    confirmToken: null,
  };

  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--status") {
      const value = readFlagValue(token, next);
      if (command === "bulk") {
        assertEnum(value, VALID_BULK_STATUSES, "--status");
      } else {
        assertEnum(value, VALID_STATUSES, "--status");
      }
      args.status = value;
      index += 1;
      continue;
    }

    if (token === "--source") {
      const value = readFlagValue(token, next);
      assertEnum(value, VALID_SOURCES, "--source");
      args.source = value;
      index += 1;
      continue;
    }

    if (token === "--limit") {
      args.limit = parseLimit(readFlagValue(token, next));
      index += 1;
      continue;
    }

    if (token === "--id") {
      if (command !== "retry") {
        throw new Error("--id is only valid for retry command");
      }
      const value = readFlagValue(token, next);
      assertUuid(value, "--id");
      args.canonicalEventId = value;
      index += 1;
      continue;
    }

    if (token === "--reason") {
      args.reason = readFlagValue(token, next);
      index += 1;
      continue;
    }

    if (token === "--execute") {
      if (command !== "bulk") {
        throw new Error("--execute is only valid for bulk command");
      }
      args.execute = true;
      continue;
    }

    if (token === "--confirm") {
      if (command !== "bulk") {
        throw new Error("--confirm is only valid for bulk command");
      }
      args.confirmToken = readFlagValue(token, next);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (command === "retry" && !args.canonicalEventId) {
    throw new Error("Missing required argument: --id <uuid>");
  }

  if (command !== "bulk" && args.confirmToken) {
    throw new Error("--confirm is only valid for bulk command");
  }

  if (command === "bulk" && args.execute && args.confirmToken !== PHASE_12_BULK_CONFIRM_TOKEN) {
    throw new Error(`--execute requires --confirm ${PHASE_12_BULK_CONFIRM_TOKEN}`);
  }

  if (command === "bulk" && !args.execute && args.confirmToken) {
    throw new Error("--confirm can only be used together with --execute for bulk command");
  }

  return args;
}

export function buildPhase12RuntimeRecoveryRequest(args) {
  if (args.command === "list") {
    const params = new URLSearchParams();
    if (typeof args.status === "string" && args.status.length > 0) {
      params.set("status", args.status);
    }
    if (typeof args.source === "string" && args.source.length > 0) {
      params.set("source", args.source);
    }
    params.set("limit", String(args.limit));

    const query = params.toString();
    return {
      method: "GET",
      path:
        query.length > 0
          ? `/v1/larry/runtime/canonical-events?${query}`
          : "/v1/larry/runtime/canonical-events",
      body: null,
    };
  }

  if (args.command === "retry") {
    const body = {};
    if (args.reason) {
      body.reason = args.reason;
    }

    return {
      method: "POST",
      path: `/v1/larry/runtime/canonical-events/${encodeURIComponent(args.canonicalEventId)}/retry`,
      body,
    };
  }

  const payload = {
    status: args.status ?? DEFAULT_RUNTIME_BULK_STATUS,
    limit: args.limit,
    execute: args.execute,
  };
  if (args.source) {
    payload.source = args.source;
  }
  if (args.reason) {
    payload.reason = args.reason;
  }

  return {
    method: "POST",
    path: "/v1/larry/runtime/canonical-events/retry-bulk",
    body: payload,
  };
}

export function readPhase12ServiceCredentials(env = process.env) {
  const baseUrl = (env.LARRY_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  const tenantId = env.LARRY_API_TENANT_ID ?? "";
  const email = env.LARRY_API_EMAIL ?? "";
  const password = env.LARRY_API_PASSWORD ?? "";

  if (!tenantId || !email || !password) {
    throw new Error(
      "Missing service credentials. Set LARRY_API_TENANT_ID, LARRY_API_EMAIL, and LARRY_API_PASSWORD."
    );
  }

  return {
    baseUrl,
    tenantId,
    email,
    password,
  };
}

async function readJsonSafely(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function loginPhase12Operator(
  credentials,
  fetchImpl = fetch
) {
  const response = await fetchImpl(`${credentials.baseUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenantId: credentials.tenantId,
      email: credentials.email,
      password: credentials.password,
    }),
  });

  const body = await readJsonSafely(response);
  if (!response.ok) {
    const message =
      typeof body?.error === "string"
        ? body.error
        : typeof body?.message === "string"
          ? body.message
          : "Operator login failed.";
    throw new Error(`[auth ${response.status}] ${message}`);
  }

  const token = typeof body?.accessToken === "string" ? body.accessToken : "";
  if (!token) {
    throw new Error("Operator login response did not include accessToken.");
  }
  return token;
}

export async function runPhase12RuntimeRecovery(
  args,
  {
    env = process.env,
    fetchImpl = fetch,
  } = {}
) {
  const credentials = readPhase12ServiceCredentials(env);
  const accessToken = await loginPhase12Operator(credentials, fetchImpl);
  const request = buildPhase12RuntimeRecoveryRequest(args);

  const response = await fetchImpl(`${credentials.baseUrl}${request.path}`, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "x-tenant-id": credentials.tenantId,
    },
    body: request.body ? JSON.stringify(request.body) : undefined,
  });

  const body = await readJsonSafely(response);
  if (!response.ok) {
    const message =
      typeof body?.error === "string"
        ? body.error
        : typeof body?.message === "string"
          ? body.message
          : "Runtime recovery request failed.";
    throw new Error(`[runtime ${response.status}] ${message}`);
  }

  return {
    request,
    status: response.status,
    body,
  };
}
