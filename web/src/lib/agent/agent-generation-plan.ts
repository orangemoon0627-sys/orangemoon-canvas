import type { CanvasAgentOp, CanvasAgentSnapshot } from "@/lib/canvas/canvas-agent-ops";
import { canonicalOrangeMoonVideoModel } from "@/lib/orange-moon-provider";
import type { CanvasGenerationMode, CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";
import type { VideoReferenceMode } from "@/types/media";

export type AgentGenerationDefaults = {
    imageModel: string;
    videoModel: string;
    audioModel: string;
    imageSize: string;
    imageQuality: string;
    imageCount: number;
    videoSize: string;
    videoSeconds: number;
    videoResolution: string;
    videoReferenceMode?: VideoReferenceMode;
};

export type AgentGenerationPlanItem = {
    id: string;
    nodeId: string;
    mode: "image" | "video" | "audio";
    title: string;
    model: string;
    size: string;
    quality: string;
    count: number;
    seconds: number;
    resolution: string;
    promptLength: number;
    hasVideoReferences: boolean;
    videoReferenceMode: VideoReferenceMode;
};

export function buildAgentGenerationPlan(ops: CanvasAgentOp[] | undefined, snapshot: CanvasAgentSnapshot | null | undefined, defaults: AgentGenerationDefaults): AgentGenerationPlanItem[] {
    const safeOps = Array.isArray(ops) ? ops : [];
    const nodes = new Map<string, CanvasNodeData>((snapshot?.nodes || []).map((node) => [node.id, node]));
    const connections = [...(snapshot?.connections || [])];

    for (const op of safeOps) {
        if (op.type === "add_node" && op.id) {
            nodes.set(op.id, {
                id: op.id,
                type: op.nodeType || "text",
                title: op.title || "生成任务",
                position: op.position || { x: op.x || 0, y: op.y || 0 },
                width: op.width || 320,
                height: op.height || 220,
                metadata: op.metadata,
            });
        }
        if (op.type === "update_node") {
            const current = nodes.get(op.id);
            if (current) nodes.set(op.id, { ...current, ...op.patch, metadata: { ...current.metadata, ...op.patch?.metadata, ...op.metadata } });
        }
        if (op.type === "connect_nodes" && !connections.some((connection) => connection.fromNodeId === op.fromNodeId && connection.toNodeId === op.toNodeId)) {
            connections.push({ id: op.id || `${op.fromNodeId}-${op.toNodeId}`, fromNodeId: op.fromNodeId, toNodeId: op.toNodeId });
        }
    }

    return safeOps.flatMap((op, index) => {
        if (op.type !== "run_generation") return [];
        const node = nodes.get(op.nodeId);
        const mode = normalizePlanMode(op.mode || node?.metadata?.generationMode || modeFromNode(node));
        if (!mode) return [];
        const metadata = node?.metadata || {};
        const incomingText = connections
            .filter((connection) => connection.toNodeId === op.nodeId)
            .map((connection) => nodes.get(connection.fromNodeId))
            .filter((source): source is CanvasNodeData => source?.type === "text")
            .map((source) => source.metadata?.content || source.metadata?.prompt || "")
            .filter(Boolean)
            .join("\n");
        const hasVideoReferences = connections
            .filter((connection) => connection.toNodeId === op.nodeId)
            .some((connection) => nodes.get(connection.fromNodeId)?.type === "video");
        const prompt = incomingText || metadata.composerContent || metadata.prompt || op.prompt || "";
        return [{
            id: `${op.nodeId}:${index}`,
            nodeId: op.nodeId,
            mode,
            title: node?.title || modeLabel(mode),
            model: normalizePlanModel(mode, metadata.model || defaultModel(mode, defaults), defaults),
            size: metadata.size || (mode === "video" ? defaults.videoSize : defaults.imageSize),
            quality: metadata.quality || defaults.imageQuality,
            count: boundedInteger(metadata.count, defaults.imageCount, 1, 4),
            seconds: boundedInteger(metadata.seconds, defaults.videoSeconds, 1, 60),
            resolution: normalizeVideoResolution(metadata.vquality || inferModelResolution(metadata.model) || defaults.videoResolution),
            promptLength: Math.max(1, prompt.trim().length),
            hasVideoReferences,
            videoReferenceMode: normalizeVideoReferenceMode(metadata.videoReferenceMode || defaults.videoReferenceMode),
        }];
    });
}

export function updateAgentGenerationOps(ops: CanvasAgentOp[] | undefined, nodeId: string, patch: Partial<CanvasNodeMetadata>) {
    const safeOps = Array.isArray(ops) ? ops : [];
    let updated = false;
    const next = safeOps.map((op) => {
        if (op.type === "add_node" && op.id === nodeId) {
            updated = true;
            return { ...op, metadata: { ...op.metadata, ...patch } };
        }
        if (op.type === "update_node" && op.id === nodeId) {
            updated = true;
            return { ...op, metadata: { ...op.metadata, ...patch } };
        }
        return op;
    });
    if (updated) return next;
    const runIndex = next.findIndex((op) => op.type === "run_generation" && op.nodeId === nodeId);
    const update: CanvasAgentOp = { type: "update_node", id: nodeId, metadata: patch };
    if (runIndex < 0) return [...next, update];
    return [...next.slice(0, runIndex), update, ...next.slice(runIndex)];
}

export function synchronizeAgentGenerationOps(ops: CanvasAgentOp[] | undefined, items: AgentGenerationPlanItem[]) {
    let next = ops;
    for (const item of items) {
        next = updateAgentGenerationOps(next, item.nodeId, {
            model: item.model,
            ...(item.mode === "audio" ? {} : { size: item.size }),
            ...(item.mode === "image" ? { quality: item.quality, count: item.count } : {}),
            ...(item.mode === "video" ? { seconds: String(item.seconds), vquality: item.resolution.replace("p", ""), videoReferenceMode: item.videoReferenceMode } : {}),
        });
    }
    return next;
}

export function generationQuoteItems(items: AgentGenerationPlanItem[]) {
    return items.map((item) => ({
        id: item.id,
        model: item.model,
        quantity: item.mode === "image" ? item.count : item.mode === "video" ? item.seconds : item.promptLength,
        ...(item.mode === "video" ? { resolution: item.resolution, hasVideoReferences: item.hasVideoReferences } : {}),
    }));
}

function modeFromNode(node: CanvasNodeData | undefined): CanvasGenerationMode | undefined {
    if (node?.type === "image") return "image";
    if (node?.type === "video") return "video";
    if (node?.type === "audio") return "audio";
    return undefined;
}

function normalizePlanMode(mode: CanvasGenerationMode | undefined): AgentGenerationPlanItem["mode"] | null {
    return mode === "image" || mode === "video" || mode === "audio" ? mode : null;
}

function defaultModel(mode: AgentGenerationPlanItem["mode"], defaults: AgentGenerationDefaults) {
    return mode === "image" ? defaults.imageModel : mode === "video" ? defaults.videoModel : defaults.audioModel;
}

function rawModelName(value: string) {
    const separator = value.indexOf("::");
    return separator >= 0 ? value.slice(separator + 2) : value;
}

function normalizePlanModel(mode: AgentGenerationPlanItem["mode"], value: string, defaults: AgentGenerationDefaults) {
    const model = rawModelName(value).trim();
    const alias = model.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (mode === "image" && (alias === "image2" || alias === "gptimage2")) return "gpt-image-2";
    if (mode === "video" && (alias === "seedance2" || alias === "seedance20")) return canonicalOrangeMoonVideoModel(rawModelName(defaults.videoModel).trim());
    if (mode === "audio" && (alias === "minimax" || alias === "minimaxspeech")) return rawModelName(defaults.audioModel).trim();
    return mode === "video" ? canonicalOrangeMoonVideoModel(model) : model;
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
    const parsed = Number(value);
    const integer = Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
    return Math.min(maximum, Math.max(minimum, integer));
}

function modeLabel(mode: AgentGenerationPlanItem["mode"]) {
    return mode === "image" ? "图片生成" : mode === "video" ? "视频生成" : "音频生成";
}

function inferModelResolution(value: unknown) {
    return typeof value === "string" ? value.match(/(480|720|1080)p?/i)?.[1] : undefined;
}

function normalizeVideoResolution(value: unknown) {
    const resolution = String(value || "720").toLowerCase().replace(/p$/, "");
    return resolution === "480" || resolution === "1080" ? `${resolution}p` : "720p";
}

function normalizeVideoReferenceMode(value: unknown): VideoReferenceMode {
    return value === "first" || value === "firstlast" ? value : "ref";
}
