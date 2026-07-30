import type { CanvasAgentOp } from "@/lib/canvas/canvas-agent-ops";

export type AgentWorkflowPreviewStat = {
    label: string;
    value: number;
};

export type AgentWorkflowPreviewStage = {
    kind: "source" | "image" | "video" | "audio" | "connection" | "change";
    label: string;
    items: string[];
};

export type AgentWorkflowPreview = {
    title: string;
    summary: string;
    stats: AgentWorkflowPreviewStat[];
    stages: AgentWorkflowPreviewStage[];
    destructive: boolean;
};

export function buildAgentWorkflowPreview(toolName: string, ops?: CanvasAgentOp[]): AgentWorkflowPreview | null {
    const safeOps = Array.isArray(ops) ? ops.filter((op) => Boolean(op?.type)) : [];
    if (toolName !== "canvas_apply_ops" || !safeOps.length) return null;

    const addedNodes = safeOps.filter((op): op is Extract<CanvasAgentOp, { type: "add_node" }> => op.type === "add_node");
    const connections = safeOps.filter((op): op is Extract<CanvasAgentOp, { type: "connect_nodes" }> => op.type === "connect_nodes");
    const generationOps = safeOps.filter((op): op is Extract<CanvasAgentOp, { type: "run_generation" }> => op.type === "run_generation");
    const changedNodes = safeOps.filter((op) => op.type === "update_node").length;
    const deleteOps = safeOps.filter((op) => op.type === "delete_node" || op.type === "delete_connections");

    const nodeTitleById = new Map(addedNodes.map((op) => [op.id || "", op.title?.trim() || nodeTypeLabel(op.nodeType)]));
    const nodeStageItems = new Map<AgentWorkflowPreviewStage["kind"], string[]>();
    for (const node of addedNodes) {
        const kind = stageKind(node.nodeType, node.metadata?.generationMode);
        const items = nodeStageItems.get(kind) || [];
        items.push(node.title?.trim() || nodeTypeLabel(node.nodeType));
        nodeStageItems.set(kind, items);
    }

    for (const run of generationOps) {
        const kind = stageKind(undefined, run.mode);
        const items = nodeStageItems.get(kind) || [];
        const target = nodeTitleById.get(run.nodeId) || `${generationModeLabel(run.mode)}任务`;
        if (!items.includes(target)) items.push(target);
        nodeStageItems.set(kind, items);
    }

    const stages: AgentWorkflowPreviewStage[] = (["source", "image", "video", "audio"] as const).map((kind) => ({ kind, label: stageLabel(kind), items: compactItems(nodeStageItems.get(kind) || []) })).filter((stage) => stage.items.length);

    if (connections.length) {
        stages.push({
            kind: "connection",
            label: "流程连接",
            items: compactItems(
                connections.map((connection) => {
                    const from = nodeTitleById.get(connection.fromNodeId) || "上游节点";
                    const to = nodeTitleById.get(connection.toNodeId) || "下游节点";
                    return `${from} -> ${to}`;
                }),
            ),
        });
    }

    if (changedNodes || deleteOps.length) {
        const items = [];
        if (changedNodes) items.push(`更新 ${changedNodes} 个已有节点`);
        if (deleteOps.length) items.push(`删除 ${deleteOps.length} 项画布内容`);
        stages.push({ kind: "change", label: "已有画布", items });
    }

    const stats = [
        { label: "节点", value: addedNodes.length },
        { label: "连线", value: connections.length },
        { label: "生成", value: generationOps.length },
    ].filter((item) => item.value > 0);
    const summaryParts = stats.map((item) => `${item.value} 个${item.label}`);
    if (changedNodes) summaryParts.push(`${changedNodes} 个更新`);
    if (deleteOps.length) summaryParts.push(`${deleteOps.length} 项删除`);

    return {
        title: generationOps.length ? "审核创作方案" : "审核画布方案",
        summary: summaryParts.length ? `将创建 ${summaryParts.join("、")}` : `将执行 ${safeOps.length} 项画布操作`,
        stats,
        stages,
        destructive: deleteOps.length > 0,
    };
}

function stageKind(nodeType?: string, generationMode?: string): AgentWorkflowPreviewStage["kind"] {
    if (generationMode === "video" || nodeType === "video") return "video";
    if (generationMode === "audio" || nodeType === "audio") return "audio";
    if (generationMode === "image" || nodeType === "image") return "image";
    return "source";
}

function stageLabel(kind: AgentWorkflowPreviewStage["kind"]) {
    if (kind === "image") return "图片生成";
    if (kind === "video") return "视频生成";
    if (kind === "audio") return "音频生成";
    return "素材与提示";
}

function generationModeLabel(mode?: string) {
    if (mode === "video") return "视频";
    if (mode === "audio") return "音频";
    if (mode === "text") return "文本";
    return "图片";
}

function nodeTypeLabel(nodeType?: string) {
    if (nodeType === "image") return "图片节点";
    if (nodeType === "video") return "视频节点";
    if (nodeType === "audio") return "音频节点";
    if (nodeType === "config") return "配置节点";
    if (nodeType === "group") return "分组";
    return "文本节点";
}

function compactItems(items: string[]) {
    const unique = Array.from(new Set(items.filter(Boolean)));
    return unique.length > 6 ? [...unique.slice(0, 6), `另有 ${unique.length - 6} 项`] : unique;
}
