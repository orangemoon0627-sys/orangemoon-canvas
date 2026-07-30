import crypto from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";

import { releaseAgentTurn, reserveAgentTurn, settleAgentTurn } from "./agent-billing.js";
import { CLOUD_AGENT_MODEL, cloudAgentConfigured, runCloudAgentTurn, type CloudAgentUsage, type CloudHistoryMessage } from "./cloud-agent.js";
import { deleteAgentThread, getAgentThread, listAgentThreads, openAgentThread, saveAgentThread, type StoredAgentMessage } from "./agent-thread-store.js";
import { CanvasSession } from "./canvas-session.js";
import type { AgentAttachment } from "./types.js";

type PlatformIdentity = { id: string; email: string; displayName: string; role: string; status: string };
type AgentMessage = StoredAgentMessage;
type CloudThread = {
    id: string;
    projectId: string;
    preview: string;
    name?: string;
    createdAt: number;
    updatedAt: number;
    messages: AgentMessage[];
    history: CloudHistoryMessage[];
};
type UserRuntime = {
    identity: PlatformIdentity;
    authCookie: string;
    session: CanvasSession;
    threads: Map<string, CloudThread>;
    activeThreadIds: Map<string, string>;
    busy: boolean;
    abortController: AbortController | null;
    lastSeenAt: number;
};

const identities = new WeakMap<Request, PlatformIdentity>();
const authCache = new Map<string, { identity: PlatformIdentity; expiresAt: number }>();
const runtimes = new Map<string, UserRuntime>();
const AUTH_CACHE_MS = 10_000;
const RUNTIME_IDLE_MS = 12 * 60 * 60 * 1000;
const MAX_ATTACHMENTS = 6;
const MAX_CONCURRENT_TURNS = boundedInteger(process.env.CANVAS_AGENT_MAX_CONCURRENT, 2, 1, 8);
let activeTurns = 0;

export function startCloudHttpServer() {
    const port = boundedInteger(process.env.PORT, 17371, 1, 65535);
    const host = process.env.CANVAS_AGENT_HOST?.trim() || "0.0.0.0";
    const app = express();
    app.disable("x-powered-by");
    app.get("/health", (_req, res) => res.json({ ok: true, mode: "cloud", configured: cloudAgentConfigured(), model: CLOUD_AGENT_MODEL, activeTurns, users: runtimes.size }));
    app.get("/config", (_req, res) => res.json({ ok: true, url: "/canvas-agent", hasToken: false, managed: true, model: CLOUD_AGENT_MODEL }));
    app.use(authenticatePlatformSession);
    app.use(express.json({ limit: process.env.CANVAS_AGENT_BODY_LIMIT || "30mb" }));

    app.get("/events", (req, res) => {
        const runtime = runtimeFor(req);
        runtime.session.openEvents(requestUrl(req), res);
    });
    app.post("/canvas/state", (req, res) => {
        runtimeFor(req).session.updateState(req.body, String(req.query.clientId || "") || undefined);
        res.json({ ok: true });
    });
    app.post("/canvas/activate", route(async (req, res) => {
        runtimeFor(req).session.activateClient(String(req.query.clientId || ""));
        res.json({ ok: true });
    }));
    app.post("/canvas/result", (req, res) => {
        const ok = runtimeFor(req).session.resolveResult(String(req.query.clientId || ""), req.body);
        res.status(ok ? 200 : 409).json({ ok });
    });
    app.post("/api/tools", route(async (req, res) => res.json({ ok: true, result: await runtimeFor(req).session.callTool(req.body?.name, req.body?.input || {}) })));
    app.get("/agent/attachments/:attachmentId", route(async (req, res) => {
        const attachment = runtimeFor(req).session.getTurnAttachment(String(req.query.clientId || ""), routeParam(req.params.attachmentId));
        const data = attachment.dataUrl.split(",", 2)[1];
        if (!data) throw new Error("图片附件内容无效");
        res.setHeader("Cache-Control", "no-store");
        res.type(attachment.type).send(Buffer.from(data, "base64"));
    }));

    app.get("/agent/codex/workspace", (req, res) => {
        const runtime = runtimeFor(req);
        const projectId = requestProjectId(req);
        res.json({ ok: true, workspace: workspace(runtime, projectId) });
    });
    app.get("/agent/codex/threads", route(async (req, res) => {
        const runtime = runtimeFor(req);
        const projectId = requestProjectId(req);
        const search = String(req.query.searchTerm || "").trim().toLowerCase();
        const result = await listAgentThreads(runtime.authCookie, projectId, search);
        runtime.activeThreadIds.set(projectId, result.activeThreadId || "");
        res.json({ ok: true, workspace: workspace(runtime, projectId), data: result.threads, nextCursor: null, backwardsCursor: null });
    }));
    app.post("/agent/codex/threads/new", route(async (req, res) => {
        const runtime = runtimeFor(req);
        if (runtime.busy) return void res.status(409).json({ ok: false, error: "创作引擎正在运行，请等待当前任务完成" });
        const projectId = requestProjectId(req);
        const thread = createThread(runtime, projectId);
        await persistThread(runtime, thread);
        runtime.session.emitThread("workspace_changed", thread.id, { activeThreadId: thread.id, emptyThread: true, projectId });
        res.json({ ok: true, workspace: workspace(runtime, projectId), thread: threadSummary(thread), messages: [] });
    }));
    app.get("/agent/codex/threads/:threadId", route(async (req, res) => {
        const runtime = runtimeFor(req);
        const projectId = requestProjectId(req);
        const thread = await loadThread(runtime, projectId, routeParam(req.params.threadId));
        runtime.activeThreadIds.set(projectId, thread.id);
        res.json({ ok: true, workspace: workspace(runtime, projectId), thread: threadSummary(thread), messages: thread.messages });
    }));
    app.post("/agent/codex/threads/:threadId/resume", route(async (req, res) => {
        const runtime = runtimeFor(req);
        if (runtime.busy) return void res.status(409).json({ ok: false, error: "创作引擎正在运行，请等待当前任务完成" });
        const projectId = requestProjectId(req);
        const threadId = routeParam(req.params.threadId);
        const persisted = await openAgentThread(runtime.authCookie, projectId, threadId);
        const thread = fromStoredThread(projectId, persisted);
        runtime.threads.set(thread.id, thread);
        runtime.activeThreadIds.set(projectId, thread.id);
        res.json({ ok: true, workspace: workspace(runtime, projectId), thread: threadSummary(thread), messages: thread.messages });
    }));
    app.post("/agent/codex/threads/:threadId/delete", route(async (req, res) => {
        const runtime = runtimeFor(req);
        if (runtime.busy) return void res.status(409).json({ ok: false, error: "创作引擎正在运行，请等待当前任务完成" });
        const projectId = requestProjectId(req);
        const threadId = routeParam(req.params.threadId);
        await deleteAgentThread(runtime.authCookie, projectId, threadId);
        runtime.threads.delete(threadId);
        if (runtime.activeThreadIds.get(projectId) === threadId) runtime.activeThreadIds.set(projectId, "");
        res.json({ ok: true, workspace: workspace(runtime, projectId) });
    }));
    app.post("/agent/codex/turn", route(async (req, res) => {
        const runtime = runtimeFor(req);
        const prompt = String(req.body?.prompt || "").trim();
        if (!prompt) return void res.status(400).json({ ok: false, error: "请输入任务内容" });
        if (!cloudAgentConfigured()) return void res.status(503).json({ ok: false, error: "云端 Agent API 尚未配置" });
        if (runtime.busy) return void res.status(409).json({ ok: false, error: "创作引擎正在运行，请等待当前任务完成" });
        if (activeTurns >= MAX_CONCURRENT_TURNS) return void res.status(429).json({ ok: false, error: "当前创作任务较多，请稍后再试" });

        const turnId = crypto.randomUUID();
        runtime.busy = true;
        runtime.abortController = new AbortController();
        activeTurns += 1;
        const clientId = String(req.body?.clientId || "");
        const projectId = requestProjectId(req);
        const previousActiveThreadId = runtime.activeThreadIds.get(projectId) || "";
        let thread: CloudThread | null = null;
        let newThread = false;
        let reserved = false;
        let messageAppended = false;
        let previousMessageCount = 0;
        let previousHistoryCount = 0;
        let previousPreview = "";
        try {
            const attachments = normalizeAttachments(req.body?.attachments);
            const requestedThreadId = String(req.body?.threadId || previousActiveThreadId);
            thread = requestedThreadId ? await loadThread(runtime, projectId, requestedThreadId) : null;
            newThread = !thread;
            if (!thread) thread = createThread(runtime, projectId, String(req.body?.messageText || prompt));
            runtime.session.bindClient(clientId, projectId);
            const reservation = await reserveAgentTurn(runtime.authCookie, { turnId, projectId, threadId: thread.id, model: CLOUD_AGENT_MODEL });
            reserved = true;
            runtime.activeThreadIds.set(projectId, thread.id);
            const attachmentRefs = runtime.session.setTurnAttachments(clientId, attachments);
            const messageId = String(req.body?.messageId || crypto.randomUUID());
            const messageText = String(req.body?.messageText || prompt);
            const userMessage: AgentMessage = { id: messageId, role: "user", text: messageText, attachments: attachments.map(withoutDataUrl) };
            previousMessageCount = thread.messages.length;
            previousHistoryCount = thread.history.length;
            previousPreview = thread.preview;
            appendMessage(thread, userMessage);
            messageAppended = true;
            thread.history.push({ role: "user", content: messageText });
            trimHistory(thread);
            await persistThread(runtime, thread);
            if (newThread) runtime.session.emitThread("workspace_changed", thread.id, { activeThreadId: thread.id, emptyThread: true, projectId });
            runtime.session.emitThread("chat_message", thread.id, { sourceClientId: clientId, message: userMessage });
            runtime.session.setCodexState({ busy: true, threadId: thread.id, turnId });
            runtime.session.emitThread("agent_event", thread.id, { agent: "terra", type: "turn.started", thread_id: thread.id, turn_id: turnId, reservedCredits: reservation.reservedCredits });
            void executeTurn(runtime, thread, promptWithAttachments(prompt, attachmentRefs), attachments, String(req.body?.creativeMode || "vibe") === "direct" ? "direct" : "vibe", turnId, clientId, projectId);
            res.json({ ok: true, threadId: thread.id, turnId, model: CLOUD_AGENT_MODEL, reservedCredits: reservation.reservedCredits });
        } catch (error) {
            if (reserved) await releaseAgentTurn(runtime.authCookie, turnId, errorMessage(error)).catch(() => undefined);
            runtime.session.clearTurnAttachments(clientId);
            runtime.session.releaseClient(clientId);
            if (thread) {
                if (messageAppended) {
                    thread.messages = thread.messages.slice(0, previousMessageCount);
                    thread.history = thread.history.slice(0, previousHistoryCount);
                    thread.preview = previousPreview;
                }
                if (newThread) runtime.threads.delete(thread.id);
            }
            runtime.activeThreadIds.set(projectId, previousActiveThreadId);
            runtime.busy = false;
            runtime.abortController = null;
            activeTurns = Math.max(0, activeTurns - 1);
            runtime.session.setCodexState({ busy: false, threadId: previousActiveThreadId, turnId });
            throw error;
        }
    }));
    app.post("/agent/codex/interrupt", (req, res) => {
        const runtime = runtimeFor(req);
        const threadId = String(req.body?.threadId || "");
        if (!runtime.busy || (threadId && ![...runtime.activeThreadIds.values()].includes(threadId))) return void res.json({ ok: false });
        runtime.abortController?.abort();
        res.json({ ok: true });
    });

    app.use((_req, res) => res.status(404).json({ ok: false, error: "not found" }));
    app.use((error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => res.status(error.status && error.status >= 400 && error.status < 600 ? error.status : 500).json({ ok: false, error: error.message }));
    app.listen(port, host, () => console.log(`Orange Moon Cloud Agent listening on ${host}:${port} with ${CLOUD_AGENT_MODEL}`));
    setInterval(cleanIdleRuntimes, 30 * 60 * 1000).unref();
}

async function executeTurn(runtime: UserRuntime, thread: CloudThread, prompt: string, attachments: AgentAttachment[], creativeMode: "vibe" | "direct", turnId: string, clientId: string, projectId: string) {
    try {
        const history = thread.history.slice(0, -1);
        const result = await runCloudAgentTurn({
            prompt,
            creativeMode,
            projectId,
            history,
            attachments,
            signal: runtime.abortController?.signal,
            executeTool: (name, input) => runtime.session.callTool(name, input),
            onText: (text, responseId) => runtime.session.emitThread("agent_event", thread.id, { agent: "terra", type: "item.updated", thread_id: thread.id, turn_id: turnId, item: { id: responseId, type: "agent_message", text } }),
            onToolStart: (call, input) => runtime.session.emitThread("agent_event", thread.id, { agent: "terra", type: "item.started", thread_id: thread.id, turn_id: turnId, item: { id: call.callId, type: "mcp_tool_call", server: "infinite-canvas", tool: call.name, status: "in_progress", arguments: input } }),
            onToolFinish: (call, value, error) => {
                appendMessage(thread, { id: `tool-${call.callId}`, role: "tool", title: error ? `${call.name} 失败` : `${call.name} 完成`, text: error || "画布操作已完成" });
                runtime.session.emitThread("agent_event", thread.id, { agent: "terra", type: "item.completed", thread_id: thread.id, turn_id: turnId, item: { id: call.callId, type: "mcp_tool_call", server: "infinite-canvas", tool: call.name, status: error ? "failed" : "completed", result: value, ...(error ? { error: { message: error } } : {}) } });
            },
        });
        const settlement = await settleAgentTurn(runtime.authCookie, turnId, result.usage);
        const assistantId = `assistant-${crypto.randomUUID()}`;
        const assistantMessage: AgentMessage = { id: assistantId, role: "assistant", title: "Terra", text: result.text, meta: usageLabel(result.usage, settlement.chargedCredits) };
        appendMessage(thread, assistantMessage);
        thread.history.push({ role: "assistant", content: result.text });
        trimHistory(thread);
        await persistThreadSafe(runtime, thread);
        runtime.session.emitThread("agent_event", thread.id, { agent: "terra", type: "item.completed", thread_id: thread.id, turn_id: turnId, usage: result.usage, chargedCredits: settlement.chargedCredits, chargedMilliCredits: settlement.chargedMilliCredits, item: { id: assistantId, type: "agent_message", text: result.text } });
        runtime.session.emitThread("agent_event", thread.id, { agent: "terra", type: "turn.completed", thread_id: thread.id, turn_id: turnId, usage: result.usage, chargedCredits: settlement.chargedCredits, chargedMilliCredits: settlement.chargedMilliCredits });
    } catch (error) {
        const message = errorMessage(error);
        let releaseError = "";
        try {
            await releaseAgentTurn(runtime.authCookie, turnId, message);
        } catch (releaseFailure) {
            releaseError = errorMessage(releaseFailure);
        }
        const item: AgentMessage = { id: `error-${crypto.randomUUID()}`, role: "error", title: "错误", text: message };
        appendMessage(thread, item);
        await persistThreadSafe(runtime, thread);
        runtime.session.emitThread("agent_error", thread.id, { message, thread_id: thread.id, turn_id: turnId, billingReleased: !releaseError, ...(releaseError ? { billingError: releaseError } : {}) });
    } finally {
        runtime.session.clearTurnAttachments(clientId);
        runtime.session.releaseClient(clientId);
        runtime.busy = false;
        runtime.abortController = null;
        activeTurns = Math.max(0, activeTurns - 1);
        thread.updatedAt = epochSeconds();
        runtime.session.setCodexState({ busy: false, threadId: thread.id, turnId });
    }
}

async function authenticatePlatformSession(req: Request, res: Response, next: NextFunction) {
    try {
        const cookie = String(req.headers.cookie || "");
        if (!cookie) return void res.status(401).json({ ok: false, error: "请先登录橙月画布" });
        const cacheKey = crypto.createHash("sha256").update(cookie).digest("hex");
        const cached = authCache.get(cacheKey);
        let identity = cached && cached.expiresAt > Date.now() ? cached.identity : null;
        if (!identity) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 5000);
            try {
                const response = await fetch(`${platformApiUrl()}/auth/me`, { headers: { accept: "application/json", cookie }, signal: controller.signal });
                if (!response.ok) return void res.status(401).json({ ok: false, error: "账户会话已失效" });
                const body = (await response.json()) as { user?: PlatformIdentity };
                if (!body.user?.id || body.user.status !== "ACTIVE") return void res.status(403).json({ ok: false, error: "账户不可用" });
                identity = body.user;
                authCache.set(cacheKey, { identity, expiresAt: Date.now() + AUTH_CACHE_MS });
            } finally {
                clearTimeout(timer);
            }
        }
        identities.set(req, identity);
        next();
    } catch (error) {
        res.status(503).json({ ok: false, error: error instanceof Error && error.name === "AbortError" ? "账户验证超时" : "账户验证失败" });
    }
}

function runtimeFor(req: Request) {
    const identity = identities.get(req);
    if (!identity) throw new Error("账户身份缺失");
    const authCookie = String(req.headers.cookie || "");
    let runtime = runtimes.get(identity.id);
    if (!runtime) {
        runtime = { identity, authCookie, session: new CanvasSession(), threads: new Map(), activeThreadIds: new Map(), busy: false, abortController: null, lastSeenAt: Date.now() };
        runtimes.set(identity.id, runtime);
    }
    runtime.identity = identity;
    runtime.authCookie = authCookie;
    runtime.lastSeenAt = Date.now();
    return runtime;
}

function createThread(runtime: UserRuntime, projectId: string, preview = "") {
    const now = epochSeconds();
    const thread: CloudThread = { id: crypto.randomUUID(), projectId, preview: preview.trim().slice(0, 120), createdAt: now, updatedAt: now, messages: [], history: [] };
    runtime.threads.set(thread.id, thread);
    runtime.activeThreadIds.set(projectId, thread.id);
    return thread;
}

function threadSummary(thread: CloudThread) {
    return { id: thread.id, preview: thread.preview, name: thread.name || null, status: "active", source: "orangemoon-cloud", createdAt: thread.createdAt, updatedAt: thread.updatedAt };
}

function workspace(runtime: UserRuntime, projectId: string) {
    return { workspacePath: "橙月云端工作区", activeThreadId: runtime.activeThreadIds.get(projectId) || undefined };
}

async function loadThread(runtime: UserRuntime, projectId: string, threadId: string) {
    const cached = runtime.threads.get(threadId);
    if (cached?.projectId === projectId) return cached;
    const thread = fromStoredThread(projectId, await getAgentThread(runtime.authCookie, projectId, threadId));
    runtime.threads.set(thread.id, thread);
    return thread;
}

function fromStoredThread(projectId: string, thread: Awaited<ReturnType<typeof getAgentThread>>): CloudThread {
    return { id: thread.id, projectId, preview: thread.preview || "", name: thread.name || undefined, createdAt: thread.createdAt, updatedAt: thread.updatedAt, messages: thread.messages || [], history: thread.history || [] };
}

async function persistThread(runtime: UserRuntime, thread: CloudThread) {
    const saved = await saveAgentThread(runtime.authCookie, thread.projectId, thread);
    thread.createdAt = saved.createdAt;
    thread.updatedAt = saved.updatedAt;
}

async function persistThreadSafe(runtime: UserRuntime, thread: CloudThread) {
    try {
        await persistThread(runtime, thread);
    } catch (error) {
        runtime.session.emitThread("agent_log", thread.id, { text: `对话保存失败：${errorMessage(error)}` });
    }
}

function appendMessage(thread: CloudThread, message: AgentMessage) {
    if (!thread.messages.some((item) => item.id === message.id)) thread.messages.push(message);
    thread.messages = thread.messages.slice(-120);
    if (!thread.preview && message.role === "user") thread.preview = message.text.slice(0, 120);
    thread.updatedAt = epochSeconds();
}

function trimHistory(thread: CloudThread) {
    thread.history = thread.history.slice(-16);
}

function normalizeAttachments(value: unknown): AgentAttachment[] {
    if (!Array.isArray(value)) return [];
    return value.slice(0, MAX_ATTACHMENTS).flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const data = item as Record<string, unknown>;
        const dataUrl = String(data.dataUrl || "");
        if (!dataUrl.startsWith("data:image/")) return [];
        return [{ id: String(data.id || crypto.randomUUID()), name: String(data.name || "图片"), type: String(data.type || "image/png"), size: Number(data.size) || 0, width: Number(data.width) || 1024, height: Number(data.height) || 1024, dataUrl }];
    });
}

function withoutDataUrl(attachment: AgentAttachment) {
    const { dataUrl: _dataUrl, ...safe } = attachment;
    return safe;
}

function promptWithAttachments(prompt: string, attachments: Array<{ id: string; name: string }>) {
    if (!attachments.length) return prompt;
    const list = attachments.map((item, index) => `${index + 1}. attachmentId=${item.id}, name=${JSON.stringify(item.name)}`).join("\n");
    return `${prompt}\n\n本轮可用图片附件：\n${list}\n需要把附件加入画布或作为生成参考时，先调用 canvas_create_attachment_nodes。`;
}

function usageLabel(usage: CloudAgentUsage, chargedCredits?: string) {
    return `${usage.total_tokens} tok${chargedCredits ? ` · ${chargedCredits} 积分` : ""}`;
}

function platformApiUrl() {
    return (process.env.PLATFORM_API_INTERNAL_URL?.trim() || "http://127.0.0.1:17400/platform-api").replace(/\/+$/, "");
}

function requestUrl(req: Request) {
    return new URL(req.originalUrl || req.url || "/", "http://canvas-agent.local");
}

function requestProjectId(req: Request) {
    const value = String(req.body?.projectId || req.query.projectId || "default").trim();
    return value.slice(0, 160) || "default";
}

function route(handler: (req: Request, res: Response) => Promise<unknown>) {
    return (req: Request, res: Response, next: NextFunction) => void handler(req, res).catch(next);
}

function routeParam(value: string | string[]) {
    return Array.isArray(value) ? value[0] || "" : value;
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, Math.floor(parsed))) : fallback;
}

function epochSeconds() {
    return Math.floor(Date.now() / 1000);
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error || "云端 Agent 运行失败");
}

function cleanIdleRuntimes() {
    const cutoff = Date.now() - RUNTIME_IDLE_MS;
    for (const [userId, runtime] of runtimes) {
        const clients = Number((runtime.session.health() as { clients?: number }).clients || 0);
        if (!runtime.busy && clients === 0 && runtime.lastSeenAt < cutoff) runtimes.delete(userId);
    }
    const now = Date.now();
    for (const [key, value] of authCache) if (value.expiresAt < now) authCache.delete(key);
}
