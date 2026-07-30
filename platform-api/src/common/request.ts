import { createHash } from "node:crypto";

import type { FastifyRequest } from "fastify";

export function requestIp(request: FastifyRequest) {
    return request.ip || "";
}

export function hashRequestIp(request: FastifyRequest) {
    const salt = String(process.env.PLATFORM_IP_HASH_SALT || "orangemoon-local");
    return createHash("sha256").update(`${salt}:${requestIp(request)}`).digest("hex");
}

export function trimUserAgent(request: FastifyRequest) {
    return String(request.headers["user-agent"] || "").slice(0, 500);
}
