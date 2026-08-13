import crypto from "node:crypto";
import type { ServerResponse } from "node:http";

import { getCreativeSkill, listCreativeSkills, type CreativeSkillId } from "./creative-skills.js";
import { buildSeedanceDirectorPrompt, defaultDirectorAssetFit, directorAssetDisplaySize, mergeDirectorScene, normalizeDirectorScene, sortDirectorLayers } from "./director-scene.js";
import { type ToolName } from "./schemas.js";
import { compactCanvasState, editableNode, isToolName, nextCanvasX, parseToolInput } from "./tools.js";
import type { AgentAttachment, CanvasNode, CanvasNodeType, CanvasSnapshot, DirectorVector3 } from "./types.js";

type PendingRequest = { clientId: string; resolve: (value: unknown) => void; reject: (error: Error) => void };
type TurnAttachment = { clientId: string; id: string; name: string; type: string; size: number; width: number; height: number; dataUrl: string };
export type CodexState = { busy: boolean; threadId: string; turnId: string };

const SITE_TOOLS = new Set<ToolName>([
    "site_navigate",
    "canvas_list_projects",
    "workbench_image_get_config",
    "workbench_image_generate",
    "workbench_video_get_config",
    "workbench_video_generate",
    "prompts_search",
    "assets_list",
    "assets_add",
    "generation_get_status",
]);

const PROJECT_LOCKED_SITE_TOOLS = new Set<ToolName>(["site_navigate", "canvas_list_projects", "workbench_image_generate", "workbench_video_generate"]);

export class CanvasSession {
    private clients = new Map<string, ServerResponse>();
    private clientFocusOrder = new Map<string, number>();
    private pending = new Map<string, PendingRequest>();
    private canvasStates = new Map<string, CanvasSnapshot>();
    private turnAttachments = new Map<string, TurnAttachment>();
    private activeClientId = "";
    private boundClientId = "";
    private boundProjectId = "";
    private focusSequence = 0;
    private codexState: CodexState = { busy: false, threadId: "", turnId: "" };

    private get canvasState() {
        return this.canvasStates.get(this.targetClientId) || null;
    }

    private get targetClientId() {
        return this.boundClientId || this.activeClientId;
    }

    health() {
        return { ok: true, hasCanvas: Boolean(this.canvasState), clients: this.clients.size, codexBusy: this.codexState.busy, boundProjectId: this.boundProjectId || undefined };
    }

    get codexBusy() {
        return this.codexState.busy;
    }

    setCodexState(patch: Partial<CodexState>) {
        this.codexState = { ...this.codexState, ...patch };
        this.emitAll("codex_state", this.codexState);
    }

    openEvents(url: URL, res: ServerResponse) {
        const clientId = url.searchParams.get("clientId") || crypto.randomUUID();
        const statusOnly = url.searchParams.get("role") === "status";
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
        if (!statusOnly) {
            this.clients.set(clientId, res);
            if (!this.clientFocusOrder.has(clientId)) this.clientFocusOrder.set(clientId, 0);
            if (!this.activeClientId) {
                this.activeClientId = clientId;
                this.clientFocusOrder.set(clientId, ++this.focusSequence);
            }
        }
        sendEvent(res, "hello", { ok: true, clientId, codex: this.codexState });
        const timer = setInterval(() => sendEvent(res, "ping", { time: Date.now() }), 15000);
        res.on("close", () => {
            clearInterval(timer);
            if (statusOnly || this.clients.get(clientId) !== res) return;
            this.clients.delete(clientId);
            this.clientFocusOrder.delete(clientId);
            this.canvasStates.delete(clientId);
            if (this.boundClientId === clientId) {
                this.boundClientId = "";
                this.boundProjectId = "";
            }
            this.pending.forEach((item, requestId) => {
                if (item.clientId !== clientId) return;
                this.pending.delete(requestId);
                item.reject(new Error("请求页面已断开"));
            });
            if (this.activeClientId === clientId) this.activeClientId = [...this.clients.keys()].sort((a, b) => (this.clientFocusOrder.get(b) || 0) - (this.clientFocusOrder.get(a) || 0))[0] || "";
        });
    }

    updateState(body: unknown, clientId?: string) {
        const targetClientId = clientId || this.activeClientId;
        if (!targetClientId) return;
        this.canvasStates.set(targetClientId, { ...((body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<string, unknown>), clientId: targetClientId } as CanvasSnapshot);
    }

    activateClient(clientId: string) {
        if (!this.clients.has(clientId)) throw new Error("当前网页未连接");
        this.activeClientId = clientId;
        this.clientFocusOrder.set(clientId, ++this.focusSequence);
    }

    bindClient(clientId: string, projectId = "") {
        if (!this.clients.has(clientId)) throw new Error("当前网页未连接");
        const expectedProjectId = projectId.trim();
        if (expectedProjectId && expectedProjectId !== "default") {
            const currentProjectId = String(this.canvasStates.get(clientId)?.projectId || "");
            if (currentProjectId !== expectedProjectId) throw new Error(`当前标签页不是本轮指定画布（期望 ${expectedProjectId}，实际 ${currentProjectId || "未加载"}）`);
        }
        this.boundClientId = clientId;
        this.boundProjectId = expectedProjectId === "default" ? "" : expectedProjectId;
    }

    releaseClient(clientId: string) {
        if (this.boundClientId === clientId) {
            this.boundClientId = "";
            this.boundProjectId = "";
        }
    }

    setTurnAttachments(clientId: string, attachments: AgentAttachment[]) {
        this.turnAttachments.clear();
        return attachments.flatMap((item, index) => {
            if (!item.dataUrl?.startsWith("data:image/")) return [];
            const id = item.id?.trim() || `attachment-${crypto.randomUUID()}`;
            const attachment: TurnAttachment = {
                clientId,
                id,
                name: item.name?.trim() || `图片 ${index + 1}`,
                type: item.type?.startsWith("image/") ? item.type : item.dataUrl.match(/^data:([^;]+)/)?.[1] || "image/png",
                size: positiveNumber(item.size, 0),
                width: positiveNumber(item.width, 1024),
                height: positiveNumber(item.height, 1024),
                dataUrl: item.dataUrl,
            };
            this.turnAttachments.set(id, attachment);
            return [{ id, name: attachment.name, type: attachment.type, size: attachment.size, width: attachment.width, height: attachment.height }];
        });
    }

    clearTurnAttachments(clientId?: string) {
        this.turnAttachments.forEach((item, id) => {
            if (!clientId || item.clientId === clientId) this.turnAttachments.delete(id);
        });
    }

    getTurnAttachment(clientId: string, attachmentId: string) {
        const attachment = this.turnAttachments.get(attachmentId);
        if (!attachment) throw new Error(`找不到本轮图片附件：${attachmentId}`);
        if (attachment.clientId !== clientId) throw new Error("图片附件不属于当前 turn 的发起标签页");
        return attachment;
    }

    resolveResult(clientId: string, body: { requestId?: string; error?: string; result?: unknown }) {
        const item = body.requestId ? this.pending.get(body.requestId) : null;
        if (!item || !body.requestId || item.clientId !== clientId) return false;
        this.pending.delete(body.requestId);
        body.error ? item.reject(new Error(body.error)) : item.resolve(body.result);
        return true;
    }

    emitAll(type: string, payload: unknown) {
        this.clients.forEach((client) => sendEvent(client, type, payload));
    }

    emitThread(type: string, threadId: string, payload: Record<string, unknown> = {}) {
        this.emitAll(type, { ...payload, threadId });
    }

    async callTool(name: unknown, rawInput: unknown) {
        if (!isToolName(name)) throw new Error(`未知工具：${String(name)}`);
        let tool: ToolName = name;
        let input = parseToolInput(tool, rawInput) as Record<string, unknown>;
        if (tool === "creative_skills_list") return { skills: listCreativeSkills() };
        if (tool === "creative_skill_get") return { skill: getCreativeSkill(String(input.id) as CreativeSkillId) };
        this.assertBoundCanvas();
        if (this.boundProjectId && PROJECT_LOCKED_SITE_TOOLS.has(tool)) throw new Error(`当前对话已锁定画布 ${this.boundProjectId}，不能跳转页面或改用独立工作台`);
        if (SITE_TOOLS.has(tool)) {
            if (!this.clients.size) throw new Error("当前没有已连接网页");
            return await this.requestCanvasTool(tool, input);
        }
        const readTool = ["canvas_get_state", "canvas_get_selection", "canvas_get_node", "canvas_export_snapshot"].includes(tool);
        if (readTool && (!this.clients.size || !this.canvasState)) throw new Error("当前没有已连接画布");
        if (tool === "canvas_get_state" || tool === "canvas_export_snapshot") return compactCanvasState(this.canvasState);
        if (tool === "canvas_get_selection") {
            const ids = new Set(this.canvasState?.selectedNodeIds || []);
            return { nodes: (this.canvasState?.nodes || []).filter((node) => ids.has(node.id)).map(editableNode) };
        }
        if (tool === "canvas_get_node") {
            const node = findNode(this.canvasState, String(input.id || ""));
            if (!node) throw new Error(`找不到节点：${String(input.id || "")}`);
            return { node: editableNode(node) };
        }
        if (tool === "canvas_create_attachment_nodes") return await this.createAttachmentNodes(input as { attachmentIds: string[]; x?: number; y?: number; gap?: number; direction?: "row" | "column" });
        if (tool === "canvas_create_node") {
            const data = input as { nodeType: CanvasNodeType; title?: string; x?: number; y?: number; width?: number; height?: number; metadata?: Record<string, unknown> };
            input = { ops: [{ type: "add_node", nodeType: data.nodeType, title: data.title, position: { x: data.x ?? nextCanvasX(this.canvasState), y: data.y ?? 0 }, width: data.width, height: data.height, metadata: data.metadata }] };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_create_text_node") {
            const text = input as { text?: string; x?: number; y?: number; title?: string; width?: number; height?: number };
            input = { ops: [textNodeOp(text, text.x ?? nextCanvasX(this.canvasState), text.y ?? 0)] };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_create_text_nodes") {
            const data = input as { items: Array<{ text: string; title?: string; x?: number; y?: number; width?: number; height?: number }>; x?: number; y?: number; gap?: number; direction?: "row" | "column" };
            const x = Number(data.x ?? nextCanvasX(this.canvasState));
            const y = Number(data.y ?? 0);
            const gap = Number(data.gap ?? 40);
            input = {
                ops: data.items.map((item, index) => textNodeOp(item, item.x ?? (data.direction === "row" ? x + index * (340 + gap) : x), item.y ?? (data.direction === "row" ? y : y + index * (240 + gap)))),
            };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_create_image_prompt_flow") {
            input = { ops: generationFlowOps({ ...(input as Record<string, unknown>), mode: "image" }, this.canvasState) };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_create_config_node") {
            const data = input as Record<string, unknown>;
            const x = Number(data.x ?? nextCanvasX(this.canvasState));
            const y = Number(data.y ?? 0);
            const configId = `config-${crypto.randomUUID()}`;
            const mode = generationMode(data.mode);
            const prompt = String(data.prompt || "");
            input = { ops: [configNodeOp(configId, data, x, y), ...(data.autoRun ? [runGenerationOp(configId, mode, prompt)] : [])] };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_create_generation_flow") {
            input = { ops: generationFlowOps(input as Record<string, unknown>, this.canvasState) };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_create_director_scene") {
            const data = input as { scene: Record<string, unknown>; title?: string; x?: number; y?: number; width?: number; height?: number };
            const scene = resolveDirectorSceneAssets(normalizeDirectorScene(data.scene), this.canvasState);
            const nodeId = `director-${crypto.randomUUID()}`;
            input = {
                ops: [
                    { type: "add_node", id: nodeId, nodeType: "director", title: data.title || scene.name || "导演台", position: { x: data.x ?? nextCanvasX(this.canvasState), y: data.y ?? 0 }, width: data.width, height: data.height, metadata: { status: "idle", director: scene } },
                    ...directorAssetConnectionOps(this.canvasState, nodeId, scene),
                    { type: "select_nodes", ids: [nodeId] },
                ],
            };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_update_director_scene") {
            const data = input as { nodeId: string; scene: Record<string, unknown>; replace?: boolean; title?: string };
            const node = requireDirectorNode(this.canvasState, data.nodeId);
            const scene = resolveDirectorSceneAssets(mergeDirectorScene(node.metadata?.director, data.scene, data.replace), this.canvasState);
            input = { ops: [{ type: "update_node", id: node.id, ...(data.title === undefined ? {} : { patch: { title: data.title } }), metadata: { director: scene } }, ...directorAssetConnectionOps(this.canvasState, node.id, scene), { type: "select_nodes", ids: [node.id] }] };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_export_director_prompt") {
            const data = input as { nodeId: string; title?: string; x?: number; y?: number; width?: number; height?: number };
            const node = requireDirectorNode(this.canvasState, data.nodeId);
            const scene = normalizeDirectorScene(node.metadata?.director);
            const textId = `text-${crypto.randomUUID()}`;
            const outputIndex = (this.canvasState?.connections || []).filter((connection) => connection.fromNodeId === node.id).length;
            input = {
                ops: [
                    textNodeOp({ id: textId, text: buildSeedanceDirectorPrompt(scene), title: data.title || `${scene.name} · Seedance 运镜`, width: data.width ?? 420, height: data.height ?? 360 }, data.x ?? node.position.x + node.width + 80, data.y ?? node.position.y + outputIndex * 380),
                    { type: "connect_nodes", fromNodeId: node.id, toNodeId: textId },
                    { type: "select_nodes", ids: [textId] },
                ],
            };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_generate_text" || tool === "canvas_generate_image" || tool === "canvas_generate_video" || tool === "canvas_generate_audio") {
            input = { ops: generationFlowOps({ ...(input as Record<string, unknown>), mode: tool.replace("canvas_generate_", ""), autoRun: true }, this.canvasState) };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_update_node") {
            const data = input as { id: string; patch?: Record<string, unknown>; metadata?: Record<string, unknown> };
            input = { ops: [{ type: "update_node", id: data.id, patch: data.patch, metadata: data.metadata }] };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_update_node_text") {
            const data = input as { id: string; text?: string; title?: string };
            if (data.text === undefined && data.title === undefined) throw new Error("更新文本节点时至少需要提供 text 或 title");
            input = {
                ops: [
                    {
                        type: "update_node",
                        id: data.id,
                        ...(data.title === undefined ? {} : { patch: { title: data.title } }),
                        ...(data.text === undefined ? {} : { metadata: { content: data.text, status: "success" } }),
                    },
                ],
            };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_move_nodes") {
            const data = input as { items: Array<{ id: string; x?: number; y?: number; dx?: number; dy?: number }> };
            input = {
                ops: data.items.map((item) => {
                    const current = findNode(this.canvasState, item.id);
                    return { type: "update_node", id: item.id, patch: { position: { x: item.x ?? ((current?.position.x || 0) + (item.dx || 0)), y: item.y ?? ((current?.position.y || 0) + (item.dy || 0)) } } };
                }),
            };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_resize_node") {
            const data = input as { id: string; width: number; height: number; freeResize?: boolean };
            input = { ops: [{ type: "update_node", id: data.id, patch: { width: data.width, height: data.height }, metadata: data.freeResize === undefined ? undefined : { freeResize: data.freeResize } }] };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_delete_nodes") {
            input = { ops: [{ type: "delete_node", ids: (input as { ids: string[] }).ids }] };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_connect_nodes") {
            const data = input as { connections: Array<{ fromNodeId: string; toNodeId: string }> };
            input = { ops: data.connections.map((connection) => ({ type: "connect_nodes", ...connection })) };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_select_nodes") {
            input = { ops: [{ type: "select_nodes", ids: (input as { ids: string[] }).ids }] };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_set_viewport") {
            input = { ops: [{ type: "set_viewport", viewport: (input as { viewport: unknown }).viewport }] };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_run_generation") {
            const data = input as { nodeId: string; mode?: string; prompt?: string };
            input = { ops: [runGenerationOp(data.nodeId, generationMode(data.mode), data.prompt)] };
            tool = "canvas_apply_ops";
        }
        if (tool !== "canvas_apply_ops") throw new Error(`未知工具：${tool}`);
        if (!this.clients.size) throw new Error("当前没有已连接画布");
        return await this.requestCanvasTool(tool, input);
    }

    private async createAttachmentNodes(input: { attachmentIds: string[]; x?: number; y?: number; gap?: number; direction?: "row" | "column" }) {
        const clientId = this.targetClientId;
        if (!this.clients.has(clientId)) throw new Error("当前没有已连接画布");
        const attachments = input.attachmentIds.map((id) => this.getTurnAttachment(clientId, id));
        const x = Number(input.x ?? nextCanvasX(this.canvasState));
        const y = Number(input.y ?? 0);
        const gap = Number(input.gap ?? 40);
        const direction = input.direction || "row";
        let offset = 0;
        const nodes = attachments.map((attachment) => {
            const size = fitAttachmentNodeSize(attachment.width, attachment.height);
            const node = {
                id: `image-${crypto.randomUUID()}`,
                attachmentId: attachment.id,
                title: attachment.name,
                position: { x: direction === "row" ? x + offset : x, y: direction === "column" ? y + offset : y },
                width: size.width,
                height: size.height,
            };
            offset += (direction === "row" ? size.width : size.height) + gap;
            return node;
        });
        await this.requestCanvasTool("canvas_create_attachment_nodes", { nodes });
        return { nodes: nodes.map(({ id, attachmentId, title }) => ({ id, attachmentId, title })) };
    }

    private async requestCanvasTool(name: ToolName, input: Record<string, unknown>) {
        this.assertBoundCanvas();
        const requestId = crypto.randomUUID();
        const clientId = this.targetClientId;
        const client = this.clients.get(clientId);
        if (!client) throw new Error("当前没有已连接画布");
        sendEvent(client, "tool_call", { requestId, name, input, projectId: this.boundProjectId || String(this.canvasStates.get(clientId)?.projectId || "") || undefined });
        return await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(requestId);
                reject(new Error("画布操作超时"));
            }, isCanvasWriteRequest(name) ? 10 * 60 * 1000 : 30000);
            this.pending.set(requestId, { clientId, resolve: (value) => (clearTimeout(timer), resolve(value)), reject: (error) => (clearTimeout(timer), reject(error)) });
        });
    }

    private assertBoundCanvas() {
        if (!this.boundClientId || !this.boundProjectId) return;
        if (!this.clients.has(this.boundClientId)) throw new Error("本轮绑定的画布网页已断开");
        const currentProjectId = String(this.canvasStates.get(this.boundClientId)?.projectId || "");
        if (currentProjectId !== this.boundProjectId) throw new Error(`本轮只允许操作画布 ${this.boundProjectId}，当前标签页已切换到 ${currentProjectId || "非画布页面"}`);
    }
}

function isCanvasWriteRequest(name: ToolName) {
    return name === "canvas_apply_ops" || name === "canvas_create_attachment_nodes";
}

function sendEvent(res: ServerResponse, type: string, payload: unknown) {
    res.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function textNodeOp(input: { id?: string; text?: string; title?: string; width?: number; height?: number }, x: number, y: number) {
    return { type: "add_node", id: input.id, nodeType: "text", title: input.title, position: { x, y }, width: input.width, height: input.height, metadata: { content: input.text || "", status: "success", fontSize: 14 } };
}

function configNodeOp(id: string, input: Record<string, unknown>, x: number, y: number) {
    const mode = generationMode(input.mode);
    const prompt = String(input.prompt || "");
    return {
        type: "add_node",
        id,
        nodeType: "config",
        title: String(input.title || generationTitle(mode)),
        position: { x, y },
        width: typeof input.width === "number" ? input.width : undefined,
        height: typeof input.height === "number" ? input.height : undefined,
        metadata: cleanRecord({
            generationMode: mode,
            composerContent: prompt,
            prompt,
            status: "idle",
            model: input.model,
            size: input.size,
            quality: input.quality,
            count: input.count,
            seconds: input.seconds,
            vquality: input.vquality,
            generateAudio: input.generateAudio,
            watermark: input.watermark,
            videoReferenceMode: input.videoReferenceMode,
            audioVoice: input.audioVoice,
            audioFormat: input.audioFormat,
            audioSpeed: input.audioSpeed,
            audioInstructions: input.audioInstructions,
        }),
    };
}

function generationFlowOps(input: Record<string, unknown>, state: CanvasSnapshot | null) {
    const mode = generationMode(input.mode);
    const prompt = String(input.prompt || "");
    const x = Number(input.x ?? nextCanvasX(state));
    const y = Number(input.y ?? 0);
    const textId = `text-${crypto.randomUUID()}`;
    const configId = `config-${crypto.randomUUID()}`;
    const referenceNodeIds = Array.isArray(input.referenceNodeIds) ? input.referenceNodeIds.filter((id): id is string => typeof id === "string") : [];
    const tokens = [`@[node:${textId}]`, ...referenceNodeIds.map((id) => `@[node:${id}]`)];
    const configInput = { ...input, prompt: tokens.join("\n") };
    return [
        textNodeOp({ id: textId, text: prompt, title: String(input.title || "提示词") }, x, y),
        configNodeOp(configId, configInput, x + 420, y),
        { type: "connect_nodes", fromNodeId: textId, toNodeId: configId },
        ...referenceNodeIds.map((fromNodeId) => ({ type: "connect_nodes", fromNodeId, toNodeId: configId })),
        { type: "select_nodes", ids: [configId] },
        ...(input.autoRun ? [runGenerationOp(configId, mode, tokens.join("\n"))] : []),
    ];
}

function runGenerationOp(nodeId: string, mode: "text" | "image" | "video" | "audio", prompt?: string) {
    return { type: "run_generation", nodeId, mode, prompt };
}

function generationMode(value: unknown): "text" | "image" | "video" | "audio" {
    return value === "text" || value === "video" || value === "audio" ? value : "image";
}

function generationTitle(mode: "text" | "image" | "video" | "audio") {
    if (mode === "text") return "文本生成";
    if (mode === "video") return "视频生成";
    if (mode === "audio") return "音频生成";
    return "图片生成";
}

function findNode(state: CanvasSnapshot | null, id: string): CanvasNode | undefined {
    return (state?.nodes || []).find((node) => node.id === id);
}

function requireDirectorNode(state: CanvasSnapshot | null, id: string) {
    const node = findNode(state, id);
    if (!node || node.type !== "director") throw new Error(`找不到导演台节点：${id}`);
    return node;
}

function resolveDirectorSceneAssets(scene: ReturnType<typeof normalizeDirectorScene>, state: CanvasSnapshot | null) {
    const objects = scene.objects.map((object, index) => {
        if (!object.sourceNodeId) return object;
        const source = findNode(state, object.sourceNodeId);
        if (!source) throw new Error(`导演台素材引用无效：找不到画布节点 ${object.sourceNodeId}`);
        if (source.type !== "image" && source.type !== "video") throw new Error(`导演台素材引用无效：节点 ${object.sourceNodeId} 不是图片或视频产物`);
        const metadata = source.metadata || {};
        const assetKind = source.type;
        const assetUrl = stringValue(metadata.content);
        const storageKey = stringValue(metadata.storageKey);
        if (!assetUrl && !storageKey) throw new Error(`导演台素材引用无效：节点 ${object.sourceNodeId} 没有可用媒体地址`);
        const role = object.role || inferDirectorAssetRole(source, assetKind, index);
        const width = positiveNumber(metadata.naturalWidth, positiveNumber(source.width, 1024));
        const height = positiveNumber(metadata.naturalHeight, positiveNumber(source.height, 1024));
        const position: DirectorVector3 = role === "background" ? [0, 0, object.position[2]] : object.position;
        const rotation: DirectorVector3 = role === "background" ? [0, 0, 0] : object.rotation;
        const scale: DirectorVector3 = role === "background" ? [1, 1, 1] : object.scale;
        const primitive = role === "character" ? "character" as const : assetKind;
        return {
            ...object,
            name: object.name === "未命名对象" ? source.title || `${assetKind === "image" ? "图片" : "视频"}素材` : object.name,
            primitive,
            assetKind,
            sourceNodeId: source.id,
            assetUrl: assetUrl || undefined,
            storageKey: storageKey || undefined,
            assetMimeType: stringValue(metadata.mimeType) || (assetKind === "image" ? "image/png" : "video/mp4"),
            assetWidth: width,
            assetHeight: height,
            displaySize: directorAssetDisplaySize(role, scene.aspectRatio, width, height),
            fit: object.fit || defaultDirectorAssetFit(role),
            role,
            position,
            rotation,
            scale,
        };
    });
    return { ...scene, objects: sortDirectorLayers(objects) };
}

function directorAssetConnectionOps(state: CanvasSnapshot | null, directorId: string, scene: ReturnType<typeof normalizeDirectorScene>) {
    const sourceIds = new Set(scene.objects.map((object) => object.sourceNodeId).filter((id): id is string => Boolean(id)));
    const existing = state?.connections || [];
    return [...sourceIds].filter((sourceId) => !existing.some((connection) => connection.fromNodeId === sourceId && connection.toNodeId === directorId)).map((sourceId) => ({ type: "connect_nodes" as const, fromNodeId: sourceId, toNodeId: directorId }));
}

function inferDirectorAssetRole(node: CanvasNode, kind: "image" | "video", index: number) {
    const label = `${node.title || ""} ${String(node.metadata?.prompt || "")}`;
    if (/(背景|场景|环境|庭院|室内|外景|山水|云海|landscape|background|environment|scene)/i.test(label)) return "background" as const;
    if (/(人物|角色|主角|男主|女主|立绘|全身|神女|仙女|少女|少年|character|portrait|person)/i.test(label)) return "character" as const;
    if (kind === "video") return "foreground" as const;
    return index === 0 ? "background" as const : "character" as const;
}

function stringValue(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : "";
}

function cleanRecord(value: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== ""));
}

function positiveNumber(value: unknown, fallback: number) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
}

function fitAttachmentNodeSize(width: number, height: number) {
    const scale = Math.min(1, 640 / width, 640 / height);
    return { width: width * scale, height: height * scale };
}
