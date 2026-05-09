import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";

/** Stable AI 2 correlation id: prefer client/proxy `x-request-id`, else new UUID. */
export function getOrCreateAi2ReqId(request: FastifyRequest): string {
  const raw = request.headers["x-request-id"];
  const fromHeader = Array.isArray(raw) ? raw[0] : raw;
  if (fromHeader && typeof fromHeader === "string" && fromHeader.trim().length > 0) {
    return fromHeader.trim().slice(0, 200);
  }
  return randomUUID();
}
