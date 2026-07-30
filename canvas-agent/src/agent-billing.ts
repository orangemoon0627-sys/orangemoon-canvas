export type AgentBillingTurn = {
    id: string;
    status: "RESERVED" | "SUCCEEDED" | "FAILED";
    reservedMilliCredits: string;
    reservedCredits: string;
    chargedMilliCredits: string;
    chargedCredits: string;
};

type AgentBillingResponse = { ok: true; turn: AgentBillingTurn };

export class AgentBillingError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
    }
}

export function reserveAgentTurn(cookie: string, input: { turnId: string; projectId: string; threadId: string; model: string }) {
    return billingRequest(cookie, "/agent/turns/reserve", { method: "POST", body: JSON.stringify(input) }, 2);
}

export function settleAgentTurn(cookie: string, turnId: string, usage: { input_tokens: number; cached_input_tokens: number; output_tokens: number; total_tokens: number }) {
    return billingRequest(cookie, `/agent/turns/${encodeURIComponent(turnId)}/settle`, {
        method: "POST",
        body: JSON.stringify({ inputTokens: usage.input_tokens, cachedInputTokens: usage.cached_input_tokens, outputTokens: usage.output_tokens, totalTokens: usage.total_tokens }),
    }, 3);
}

export function releaseAgentTurn(cookie: string, turnId: string, error: string) {
    return billingRequest(cookie, `/agent/turns/${encodeURIComponent(turnId)}/release`, { method: "POST", body: JSON.stringify({ error: error.slice(0, 1_000) }) }, 3);
}

async function billingRequest(cookie: string, path: string, init: RequestInit, attempts: number) {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8_000);
        try {
            const response = await fetch(`${platformApiUrl()}${path}`, {
                ...init,
                headers: {
                    accept: "application/json",
                    "content-type": "application/json",
                    cookie,
                    "x-canvas-agent-secret": internalSecret(),
                    ...init.headers,
                },
                signal: controller.signal,
            });
            const body = (await response.json().catch(() => null)) as (AgentBillingResponse & { message?: string | string[]; error?: string }) | null;
            if (!response.ok) {
                const message = Array.isArray(body?.message) ? body.message.join("；") : body?.message || body?.error || `Agent 计费请求失败（${response.status}）`;
                const error = new AgentBillingError(response.status, message);
                if (response.status < 500) throw error;
                lastError = error;
            } else if (body?.turn) {
                return body.turn;
            } else {
                lastError = new AgentBillingError(502, "Agent 计费服务返回格式无效");
            }
        } catch (error) {
            if (error instanceof AgentBillingError && error.status < 500) throw error;
            lastError = error;
        } finally {
            clearTimeout(timeout);
        }
        if (attempt + 1 < attempts) await delay(250 * (attempt + 1));
    }
    if (lastError instanceof AgentBillingError) throw lastError;
    throw new AgentBillingError(503, lastError instanceof Error && lastError.name === "AbortError" ? "Agent 计费服务请求超时" : "Agent 计费服务暂时不可用");
}

function platformApiUrl() {
    return (process.env.PLATFORM_API_INTERNAL_URL?.trim() || "http://127.0.0.1:17400/platform-api").replace(/\/+$/, "");
}

function internalSecret() {
    return process.env.CANVAS_AGENT_INTERNAL_SECRET?.trim() || "orangemoon-local-agent-billing-secret";
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
