import express, { type NextFunction, type Request, type Response } from "express";

import { DEFAULT_PORT, ensureSiteWorkspace, loadConfig, saveConfig, updateSiteWorkspace, type AgentCreativeMode, type CanvasAgentConfig } from "./config.js";
import { CanvasSession } from "./canvas-session.js";
import { archiveCodexThread, interruptCodexTurn, isRecoverableThreadError, listCodexThreads, readCodexThread, resumeCodexThread, runClaudeTurn, runCodexTurn, startCodexThread, summarizeCodexThread, verifyCodexThreadWorkspace, withAgentPrompt } from "./agents.js";
import { registerProviderGateway } from "./provider-gateway.js";
import type { AgentAttachment } from "./types.js";

export function startHttpServer() {
    const config = loadConfig(true);
    const port = Number(process.env.PORT) || Number(new URL(config.url).port) || DEFAULT_PORT;
    config.url = `http://127.0.0.1:${port}`;
    saveConfig(config);

    const session = new CanvasSession();
    let fallbackThreadId = "";
    const emit = (type: string, payload: unknown) => {
        const data = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : { value: payload };
        const threadId = String(data.threadId || data.thread_id || fallbackThreadId || "");
        threadId ? session.emitThread(type, threadId, data) : session.emitAll(type, data);
    };
    const getProjectWorkspace = (projectId: string) => {
        const current = ensureSiteWorkspace(config);
        const activeThreadIds = { ...(current.activeThreadIds || {}) };
        const projectThreadIds = cloneProjectThreadIds(current.projectThreadIds);
        if (current.activeThreadId && !Object.values(activeThreadIds).includes(current.activeThreadId)) {
            activeThreadIds[projectId] = current.activeThreadId;
            projectThreadIds[projectId] = uniqueStrings([...(projectThreadIds[projectId] || []), current.activeThreadId]);
            updateSiteWorkspace(config, { activeThreadId: undefined, activeThreadIds, projectThreadIds });
        }
        return { workspacePath: current.workspacePath, activeThreadId: activeThreadIds[projectId] || undefined };
    };
    const setActiveThread = (projectId: string, activeThreadId: string, payload: Record<string, unknown> = {}) => {
        const current = ensureSiteWorkspace(config);
        const activeThreadIds = { ...(current.activeThreadIds || {}) };
        const projectThreadIds = cloneProjectThreadIds(current.projectThreadIds);
        if (activeThreadId) {
            activeThreadIds[projectId] = activeThreadId;
            projectThreadIds[projectId] = uniqueStrings([...(projectThreadIds[projectId] || []), activeThreadId]);
            fallbackThreadId = activeThreadId;
        } else {
            delete activeThreadIds[projectId];
        }
        updateSiteWorkspace(config, { activeThreadId: undefined, activeThreadIds, projectThreadIds });
        const workspace = { workspacePath: current.workspacePath, activeThreadId: activeThreadId || undefined };
        session.emitThread("workspace_changed", activeThreadId, { ...payload, activeThreadId, projectId });
        return workspace;
    };
    const removeProjectThread = (projectId: string, threadId: string) => {
        const current = ensureSiteWorkspace(config);
        const activeThreadIds = { ...(current.activeThreadIds || {}) };
        const projectThreadIds = cloneProjectThreadIds(current.projectThreadIds);
        projectThreadIds[projectId] = (projectThreadIds[projectId] || []).filter((id) => id !== threadId);
        if (activeThreadIds[projectId] === threadId) delete activeThreadIds[projectId];
        updateSiteWorkspace(config, { activeThreadId: undefined, activeThreadIds, projectThreadIds });
    };
    const assertProjectThread = (projectId: string, threadId: string) => {
        const current = ensureSiteWorkspace(config);
        if (!(current.projectThreadIds?.[projectId] || []).includes(threadId)) throw httpError(409, "这个对话不属于当前画布");
    };
    const app = express();
    app.disable("x-powered-by");
    app.use((req, res, next) => {
        const url = requestUrl(req, config);
        if (!setCors(req, res, url, config)) return void res.status(403).json({ ok: false, error: "origin not allowed" });
        if (req.method === "OPTIONS") return void res.json({});
        next();
    });
    app.get("/health", (_req, res) => res.json(session.health()));
    app.get("/config", (_req, res) => res.json({ ok: true, url: config.url, hasToken: true }));
    app.use((req, res, next) => {
        if (validToken(req, requestUrl(req, config), config.token)) return next();
        res.status(401).json({ ok: false, error: "invalid token" });
    });
    app.use("/providers", express.json({ limit: "64mb" }));
    app.use(express.json({ limit: "30mb" }));
    registerProviderGateway(app);
    app.get("/events", (req, res) => session.openEvents(requestUrl(req, config), res));
    app.post("/canvas/state", (req, res) => {
        session.updateState(req.body, String(req.query.clientId || "") || undefined);
        res.json({ ok: true });
    });
    app.post("/canvas/activate", (req, res) => {
        session.activateClient(String(req.query.clientId || ""));
        res.json({ ok: true });
    });
    app.post("/canvas/result", (req, res) => {
        const ok = session.resolveResult(String(req.query.clientId || ""), req.body);
        res.status(ok ? 200 : 409).json({ ok });
    });
    app.get("/agent/attachments/:attachmentId", route(async (req, res) => {
        const attachment = session.getTurnAttachment(String(req.query.clientId || ""), routeParam(req.params.attachmentId));
        const data = attachment.dataUrl.split(",", 2)[1];
        if (!data) throw new Error("图片附件内容无效");
        res.setHeader("Cache-Control", "no-store");
        res.type(attachment.type).send(Buffer.from(data, "base64"));
    }));
    app.post("/api/tools", route(async (req, res) => res.json({ ok: true, result: await session.callTool(req.body?.name, req.body?.input || {}) })));
    app.get("/agent/codex/workspace", (req, res) => {
        const projectId = requestProjectId(req);
        const workspace = getProjectWorkspace(projectId);
        res.json({ ok: true, workspace });
    });
    app.get("/agent/codex/threads", route(async (req, res) => {
        const projectId = requestProjectId(req);
        const workspace = getProjectWorkspace(projectId);
        const result = await listCodexThreads(emit, { cwd: workspace.workspacePath, searchTerm: String(req.query.searchTerm || "") });
        const allowedThreadIds = new Set(ensureSiteWorkspace(config).projectThreadIds?.[projectId] || []);
        res.json({ ok: true, workspace, ...result, data: result.data.filter((thread) => allowedThreadIds.has(thread.id)) });
    }));
    app.post("/agent/codex/threads/new", route(async (req, res) => {
        if (session.codexBusy) return res.status(409).json({ ok: false, error: "Codex 正在运行，请等待当前任务完成" });
        const projectId = requestProjectId(req);
        const workspace = getProjectWorkspace(projectId);
        const thread = await startCodexThread(emit, workspace.workspacePath);
        const activeThreadId = String((thread as Record<string, unknown>).id || "");
        const nextWorkspace = setActiveThread(projectId, activeThreadId, { emptyThread: true });
        res.json({ ok: true, workspace: nextWorkspace, thread: summarizeCodexThread(thread), messages: [] });
    }));
    app.get("/agent/codex/threads/:threadId", route(async (req, res) => {
        const projectId = requestProjectId(req);
        const workspace = getProjectWorkspace(projectId);
        const threadId = routeParam(req.params.threadId);
        assertProjectThread(projectId, threadId);
        try {
            res.json({ ok: true, workspace, ...(await readCodexThread(emit, threadId, workspace.workspacePath)) });
        } catch (error) {
            if (workspace.activeThreadId !== threadId || !isRecoverableThreadError(error)) throw error;
            res.json({ ok: true, workspace, thread: { id: threadId, preview: "", cwd: workspace.workspacePath }, messages: [] });
        }
    }));
    app.post("/agent/codex/threads/:threadId/resume", route(async (req, res) => {
        if (session.codexBusy) return res.status(409).json({ ok: false, error: "Codex 正在运行，请等待当前任务完成" });
        const projectId = requestProjectId(req);
        const workspace = getProjectWorkspace(projectId);
        const threadId = routeParam(req.params.threadId);
        assertProjectThread(projectId, threadId);
        const result = await resumeCodexThread(emit, threadId, workspace.workspacePath);
        const nextWorkspace = setActiveThread(projectId, threadId);
        res.json({ ok: true, workspace: nextWorkspace, ...result });
    }));
    app.post("/agent/codex/threads/:threadId/delete", route(async (req, res) => {
        if (session.codexBusy) return res.status(409).json({ ok: false, error: "Codex 正在运行，请等待当前任务完成" });
        const projectId = requestProjectId(req);
        const workspace = getProjectWorkspace(projectId);
        const threadId = routeParam(req.params.threadId);
        assertProjectThread(projectId, threadId);
        await archiveCodexThread(emit, threadId, workspace.workspacePath);
        removeProjectThread(projectId, threadId);
        if (workspace.activeThreadId === threadId) session.emitThread("workspace_changed", threadId, { activeThreadId: "", projectId });
        res.json({ ok: true });
    }));
    app.post("/agent/codex/turn", route(async (req, res) => {
        if (session.codexBusy) return res.status(409).json({ ok: false, error: "Codex 正在运行，请等待当前任务完成" });
        const attachments = Array.isArray(req.body?.attachments) ? (req.body.attachments as AgentAttachment[]) : [];
        const prompt = String(req.body?.prompt || "");
        const creativeMode = normalizeCreativeMode(req.body?.creativeMode);
        if (!prompt.trim()) return res.status(400).json({ ok: false, error: "请输入任务内容" });
        const clientId = String(req.body?.clientId || "");
        const projectId = requestProjectId(req);
        const workspace = getProjectWorkspace(projectId);
        const requestedThreadId = String(req.body?.threadId || "");
        if (requestedThreadId) assertProjectThread(projectId, requestedThreadId);
        session.setCodexState({ busy: true, threadId: String(req.body?.threadId || workspace.activeThreadId || ""), turnId: "" });
        try {
            session.bindClient(clientId, projectId);
            let threadId = String(req.body?.threadId || workspace.activeThreadId || "");
            let turnId = "";
            if (!threadId) {
                const thread = await startCodexThread(emit, workspace.workspacePath);
                threadId = String((thread as Record<string, unknown>).id || "");
                setActiveThread(projectId, threadId, { emptyThread: true });
            } else if (threadId !== workspace.activeThreadId) {
                await verifyCodexThreadWorkspace(emit, threadId, workspace.workspacePath);
                setActiveThread(projectId, threadId);
            }
            const attachmentRefs = session.setTurnAttachments(clientId, attachments);
            const chatMessage = {
                sourceClientId: clientId,
                message: { id: String(req.body?.messageId || Date.now()), role: "user", text: String(req.body?.messageText || prompt || `发送了 ${attachments.length} 张图片`) },
            };
            let chatThreadId = "";
            const turnEmit = (type: string, payload: unknown) => {
                const data = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : { value: payload };
                session.emitThread(type, threadId, data);
            };
            void runCodexTurn(withAgentPrompt(withCanvasLock(withAttachmentContext(prompt, attachmentRefs), projectId), creativeMode), turnEmit, attachments, {
                threadId,
                cwd: workspace.workspacePath,
                appEmit: emit,
                onThread: (actualThreadId) => {
                    if (actualThreadId !== threadId) {
                        removeProjectThread(projectId, threadId);
                        threadId = actualThreadId;
                        setActiveThread(projectId, threadId, { emptyThread: true });
                    }
                    session.setCodexState({ busy: true, threadId, turnId: "" });
                    if (chatThreadId !== threadId) {
                        chatThreadId = threadId;
                        session.emitThread("chat_message", threadId, chatMessage);
                    }
                },
                onTurn: (actualTurnId) => {
                    turnId = actualTurnId;
                    session.setCodexState({ busy: true, threadId, turnId });
                },
                onFinish: () => {
                    session.clearTurnAttachments(clientId);
                    if (clientId) session.releaseClient(clientId);
                    session.setCodexState({ busy: false, threadId, turnId });
                },
            });
            res.json({ ok: true, threadId });
        } catch (error) {
            session.clearTurnAttachments(clientId);
            session.releaseClient(clientId);
            session.setCodexState({ busy: false, threadId: String(req.body?.threadId || workspace.activeThreadId || ""), turnId: "" });
            throw error;
        }
    }));
    app.post("/agent/codex/interrupt", (req, res) => {
        const ok = interruptCodexTurn(String(req.body?.threadId || ""));
        res.json({ ok });
    });
    app.post("/agent/claude/turn", (req, res) => {
        runClaudeTurn(withAgentPrompt(String(req.body?.prompt || ""), normalizeCreativeMode(req.body?.creativeMode)), emit);
        res.json({ ok: true });
    });
    app.use((_req, res) => res.status(404).json({ ok: false, error: "not found" }));
    app.use((error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => res.status(error.status && error.status >= 400 && error.status < 600 ? error.status : 500).json({ ok: false, error: error.message }));

    app.listen(port, "127.0.0.1", () => {
        console.log("Orange Moon Canvas Agent");
        console.log(`Local URL: ${config.url}`);
        console.log(`Connect token: ${config.token}`);
        console.log("Codex MCP is not installed by this command.");
        console.log("Optional MCP add: codex mcp add infinite-canvas -- npx -y @basketikun/canvas-agent mcp");
        console.log("Remove manually added MCP: codex mcp remove infinite-canvas");
    });
}

function route(handler: (req: Request, res: Response) => Promise<unknown>) {
    return (req: Request, res: Response, next: NextFunction) => void handler(req, res).catch(next);
}

function routeParam(value: string | string[]) {
    return Array.isArray(value) ? value[0] || "" : value;
}

function requestProjectId(req: Request) {
    return String(req.body?.projectId || req.query.projectId || "default").trim() || "default";
}

function cloneProjectThreadIds(value?: Record<string, string[]>) {
    return Object.fromEntries(Object.entries(value || {}).map(([projectId, threadIds]) => [projectId, uniqueStrings(threadIds)]));
}

function uniqueStrings(values: string[]) {
    return [...new Set(values.filter(Boolean))];
}

function httpError(status: number, message: string) {
    return Object.assign(new Error(message), { status });
}

function normalizeCreativeMode(value: unknown): AgentCreativeMode {
    return value === "direct" ? "direct" : "vibe";
}

function requestUrl(req: Request, config: CanvasAgentConfig) {
    return new URL(req.originalUrl || req.url || "/", config.url);
}

function setCors(req: Request, res: Response, url: URL, config: CanvasAgentConfig) {
    const origin = req.headers.origin;
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "content-type,x-canvas-agent-token");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    if (!origin || req.method === "OPTIONS" || url.pathname === "/health" || url.pathname === "/config") return true;
    config.origins ||= [];
    if (validToken(req, url, config.token) && !config.origins.includes(origin)) {
        config.origins.push(origin);
        saveConfig(config);
    }
    res.setHeader("Vary", "Origin");
    return config.origins.includes(origin);
}

function validToken(req: Request, url: URL, token: string) {
    const header = req.headers["x-canvas-agent-token"];
    return url.searchParams.get("token") === token || header === token || (Array.isArray(header) && header.includes(token));
}

function withAttachmentContext(prompt: string, attachments: Array<{ id: string; name: string }>) {
    if (!attachments.length) return prompt;
    const list = attachments.map((item, index) => `${index + 1}. attachmentId=${item.id}, name=${JSON.stringify(item.name)}`).join("\n");
    return `${prompt}\n\n本轮可用图片附件（顺序与图片输入一致）：\n${list}\n需要把附件放入画布或作为生成参考图时，先调用 canvas_create_attachment_nodes，再使用返回的画布节点 ID 创建生成流程。`;
}

function withCanvasLock(prompt: string, projectId: string) {
    if (!projectId || projectId === "default") return prompt;
    return `${prompt}\n\n本轮已锁定当前画布 projectId=${projectId}。只操作这个画布，不要列出、选择或跳转到其他画布，也不要改用独立生图或视频工作台。`;
}
