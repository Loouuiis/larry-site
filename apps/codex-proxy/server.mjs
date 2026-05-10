import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = Number(process.env.PORT ?? "3011");
const CODEX_BINARY =
  process.env.CODEX_BINARY ??
  (existsSync("/usr/local/bin/codex")
    ? "/usr/local/bin/codex"
    : existsSync("/opt/homebrew/bin/codex")
      ? "/opt/homebrew/bin/codex"
      : "codex");
const CODEX_REASONING_EFFORT = process.env.CODEX_REASONING_EFFORT ?? "medium";
const CODEX_TIMEOUT_MS = Number(process.env.CODEX_TIMEOUT_MS ?? "120000");
const CODEX_WORKDIR = process.env.CODEX_WORKDIR ?? process.cwd();
let requestCounter = 0;

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function contentToText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) return String(part.text ?? "");
        return JSON.stringify(part);
      })
      .join("\n");
  }
  return content == null ? "" : JSON.stringify(content);
}

function truncateForLog(value, max = 400) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Prepend an explicit schema instruction so codex exec sees structured-output requirements. */
function injectSchemaInstruction(messages, requestBody) {
  const schema =
    requestBody?.response_format?.json_schema?.schema ??
    requestBody?.tools?.[0]?.function?.parameters ??
    null;
  if (!schema) return messages;

  const schemaInstruction = {
    role: "system",
    content: [
      "You must respond with a single valid JSON object that strictly matches this schema.",
      "Do not include any text before or after the JSON object.",
      "Do not wrap the JSON in markdown code fences.",
      "Schema:",
      JSON.stringify(schema, null, 2),
    ].join("\n"),
  };

  return [schemaInstruction, ...messages];
}

function validateJsonResponse(text, requestBody) {
  const schema = requestBody?.response_format?.json_schema ?? null;
  if (!schema) return { valid: true };

  try {
    JSON.parse(text);
    return { valid: true };
  } catch {
    return { valid: false, reason: "Response is not valid JSON", preview: text.slice(0, 300) };
  }
}

function buildPrompt(body) {
  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const messages = injectSchemaInstruction(rawMessages, body);
  const responseFormat = body.response_format;
  const jsonSchema = responseFormat?.type === "json_schema" ? responseFormat.json_schema : null;
  const wantsJson = responseFormat?.type === "json_object" || jsonSchema;
  const tools = Array.isArray(body.tools) && body.tools.length > 0 ? body.tools : [];

  return [
    "You are serving as an OpenAI-compatible local model endpoint for Larry.",
    "Answer the application request exactly as the upstream app expects.",
    wantsJson
      ? "Return exactly one valid JSON value. No markdown, no code fences, no extra text."
      : "Return plain assistant text. No markdown unless the user asks for it.",
    jsonSchema && !jsonSchema.schema ? `JSON schema name: ${jsonSchema.name ?? "response"}` : "",
    tools.length > 0
      ? [
          "Tool definitions were supplied by the caller.",
          "If a tool is needed, return exactly one JSON object shaped like:",
          '{"tool_calls":[{"name":"tool_name","arguments":{"example":"value"}}],"content":null}',
          "If no tool is needed, return normal assistant text or the required JSON response format.",
          `Tools:\n${JSON.stringify(tools)}`,
        ].join("\n")
      : "",
    "",
    "Conversation:",
    messages
      .map((message) => {
        const role = typeof message.role === "string" ? message.role : "user";
        return `${role.toUpperCase()}:\n${contentToText(message.content)}`;
      })
      .join("\n\n"),
  ].filter(Boolean).join("\n");
}

function parseToolEnvelope(content) {
  try {
    const parsed = JSON.parse(content);
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray(parsed.tool_calls) &&
      parsed.tool_calls.every((call) => call && typeof call.name === "string" && call.arguments && typeof call.arguments === "object")
    ) {
      return parsed;
    }
  } catch {
    // fall through
  }
  return null;
}

async function runCodex(prompt, model) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), "larry-codex-proxy-"));
  const outputPath = path.join(tmpDir, "last-message.txt");
  const args = [
    "exec",
    "-m",
    model || process.env.CODEX_MODEL || "gpt-5.2",
    "-c",
    `model_reasoning_effort="${CODEX_REASONING_EFFORT}"`,
    "--ephemeral",
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--output-last-message",
    outputPath,
    "--color",
    "never",
    prompt,
  ];

  try {
    const { code, signal, stderr } = await new Promise((resolve, reject) => {
      const child = spawn(CODEX_BINARY, args, {
        cwd: CODEX_WORKDIR,
        env: {
          ...process.env,
          PATH: [process.env.PATH, "/usr/local/bin", "/opt/homebrew/bin"].filter(Boolean).join(":"),
        },
        stdio: ["ignore", "ignore", "pipe"],
      });
      let stderr = "";
      const timer = setTimeout(() => child.kill("SIGTERM"), CODEX_TIMEOUT_MS);

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
        if (stderr.length > 12000) stderr = stderr.slice(-12000);
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal, stderr });
      });
    });

    const output = await readFile(outputPath, "utf8").catch(() => "");
    if (code !== 0) {
      console.warn("[codex-proxy] codex exec failed", {
        exitCode: code,
        stderr: stderr?.slice(0, 300),
        ts: new Date().toISOString(),
      });
      const timedOut = signal === "SIGTERM" ? `Codex CLI timed out after ${CODEX_TIMEOUT_MS}ms. ` : "";
      throw new Error(`${timedOut}Codex CLI exited with code ${code ?? "unknown"}: ${stderr.slice(-2000)}`);
    }
    if (!output.trim()) throw new Error(`Codex CLI returned empty output: ${stderr.slice(-2000)}`);
    return output.trim();
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

function writeCompletion(res, body, content) {
  const toolEnvelope = Array.isArray(body.tools) && body.tools.length > 0 ? parseToolEnvelope(content) : null;
  if ((body.response_format || body.tools) && !toolEnvelope && body.response_format?.type !== undefined) {
    console.warn(
      `[codex-proxy] structured response did not produce a tool envelope; model=${body.model ?? "codex"} response_format=${body.response_format?.type} preview=${truncateForLog(content)}`,
    );
  }
  if (toolEnvelope) {
    return json(res, 200, {
      id: `chatcmpl_codex_${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: body.model ?? "codex",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: toolEnvelope.content ?? null,
            tool_calls: toolEnvelope.tool_calls.map((call, index) => ({
              id: `call_${Date.now()}_${index}`,
              type: "function",
              function: {
                name: call.name,
                arguments: JSON.stringify(call.arguments),
              },
            })),
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
  }
  json(res, 200, {
    id: `chatcmpl_codex_${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: body.model ?? "codex",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  });
}

function writeStream(res, body, content) {
  const id = `chatcmpl_codex_${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const model = body.model ?? "codex";
  const toolEnvelope = Array.isArray(body.tools) && body.tools.length > 0 ? parseToolEnvelope(content) : null;
  if ((body.response_format || body.tools) && !toolEnvelope && body.response_format?.type !== undefined) {
    console.warn(
      `[codex-proxy] streamed structured response had no tool envelope; model=${model} response_format=${body.response_format?.type} preview=${truncateForLog(content)}`,
    );
  }
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const send = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
  send({ id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] });
  if (toolEnvelope) {
    send({
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: toolEnvelope.tool_calls.map((call, index) => ({
              index,
              id: `call_${Date.now()}_${index}`,
              type: "function",
              function: {
                name: call.name,
                arguments: JSON.stringify(call.arguments),
              },
            })),
          },
          finish_reason: null,
        },
      ],
    });
    send({ id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] });
    res.write("data: [DONE]\n\n");
    res.end();
    return;
  }
  for (const chunk of content.match(/[\s\S]{1,120}/g) ?? []) {
    send({ id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }] });
  }
  send({ id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
  res.write("data: [DONE]\n\n");
  res.end();
}

const server = createServer(async (req, res) => {
  const headerReqId = typeof req.headers["x-request-id"] === "string" ? req.headers["x-request-id"].trim() : "";
  const requestId = headerReqId.length > 0 ? headerReqId : `req_${Date.now()}_${++requestCounter}`;
  try {
    if (req.method === "GET" && req.url === "/health") {
      return json(res, 200, { ok: true, service: "larry-codex-proxy" });
    }

    if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
      return json(res, 404, { error: { message: "Not found" } });
    }

    const body = await readJson(req);
    console.log("[codex-proxy] request", {
      reqId: requestId,
      model: body?.model,
      messageCount: body?.messages?.length,
      hasResponseFormat: Boolean(body?.response_format),
      hasTools: Boolean(body?.tools?.length),
      stream: Boolean(body?.stream),
      ts: new Date().toISOString(),
    });
    const output = await runCodex(buildPrompt(body), body.model);
    const validation = validateJsonResponse(output, body);
    if (!validation.valid) {
      console.warn("[codex-proxy] model returned non-JSON:", validation.preview);
      return json(res, 422, { error: "Model did not return valid JSON", preview: validation.preview });
    }
    if (body.stream) return writeStream(res, body, output);
    return writeCompletion(res, body, output);
  } catch (error) {
    console.warn(
      `[codex-proxy] reqId=${requestId} error ${error instanceof Error ? truncateForLog(error.message, 600) : String(error)}`,
    );
    return json(res, 500, {
      error: {
        message: error instanceof Error ? error.message : String(error),
        type: "codex_proxy_error",
      },
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[codex-proxy] listening on ${PORT}`);
});
