import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { useAgentStore } from "@/stores/use-agent-store";
import { applyCanvasAgentOps, type CanvasAgentOp, type CanvasAgentSnapshot } from "@/lib/canvas/canvas-agent-ops";
import { generationLoadingMetadata } from "@/lib/canvas/canvas-generation-progress";
import type { CanvasNodeGenerationMode } from "@/components/canvas/canvas-node-prompt-panel";
import type { CanvasConnection, CanvasNodeData, ContextMenuState, ViewportTransform } from "@/types/canvas";

type GenerateNodeRef = MutableRefObject<((nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => Promise<void>) | null>;

type AgentBridgeParams = {
    projectId: string;
    title: string | undefined;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    selectedNodeIds: Set<string>;
    viewport: ViewportTransform;
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    selectedNodeIdsRef: MutableRefObject<Set<string>>;
    viewportRef: MutableRefObject<ViewportTransform>;
    generateNodeRef: GenerateNodeRef;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setViewport: Dispatch<SetStateAction<ViewportTransform>>;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
};

/**
 * 画布与本地 Agent 的桥接：把当前画布快照与 apply/undo 能力发布到 agent store，
 * 供本地 Codex 面板读取。除 applyAgentOps（配置节点插件宿主会用到）外均为内部实现。
 */
export function useAgentBridge(params: AgentBridgeParams) {
    const { projectId, title, nodes, connections, selectedNodeIds, viewport, nodesRef, connectionsRef, selectedNodeIdsRef, viewportRef, generateNodeRef, setNodes, setConnections, setSelectedNodeIds, setSelectedConnectionId, setViewport, setContextMenu } =
        params;
    const setAgentCanvasContext = useAgentStore((state) => state.setCanvasContext);
    const [agentUndoSnapshot, setAgentUndoSnapshot] = useState<CanvasAgentSnapshot | null>(null);
    const publishedContextRef = useRef<ReturnType<typeof createAgentCanvasContext> | null>(null);
    const projectTitle = title || "未命名画布";

    const agentSnapshot = useMemo<CanvasAgentSnapshot>(() => ({ projectId, title: projectTitle, nodes, connections, selectedNodeIds: Array.from(selectedNodeIds), viewport }), [connections, projectTitle, nodes, projectId, selectedNodeIds, viewport]);
    const applyAgentOps = useCallback(
        (ops?: CanvasAgentOp[]) => {
            const safeOps = Array.isArray(ops) ? ops.filter((op) => op?.type) : [];
            const before = { projectId, title: projectTitle, nodes: nodesRef.current, connections: connectionsRef.current, selectedNodeIds: Array.from(selectedNodeIdsRef.current), viewport: viewportRef.current };
            const generationOps = safeOps.filter((op): op is Extract<CanvasAgentOp, { type: "run_generation" }> => op.type === "run_generation" && Boolean(op.nodeId));
            const generationByNodeId = new Map(generationOps.map((op) => [op.nodeId, op]));
            const addedGenerationTargets = new Set<string>();
            const structuralOps = safeOps
                .filter((op) => op.type !== "run_generation")
                .map((op) => {
                    if (op.type !== "add_node" || !op.id) return op;
                    const generation = generationByNodeId.get(op.id);
                    if (!generation) return op;
                    addedGenerationTargets.add(op.id);
                    const mode = generation.mode || op.metadata?.generationMode || "image";
                    return { ...op, metadata: { ...generationLoadingMetadata(mode, { ...op.metadata, prompt: generation.prompt || op.metadata?.prompt }), generationStage: "已确认，正在创建任务" } };
                });
            for (const generation of generationOps) {
                if (addedGenerationTargets.has(generation.nodeId)) continue;
                const target = before.nodes.find((node) => node.id === generation.nodeId);
                const mode = generation.mode || target?.metadata?.generationMode || "image";
                structuralOps.push({
                    type: "update_node",
                    id: generation.nodeId,
                    metadata: { ...generationLoadingMetadata(mode, { ...target?.metadata, prompt: generation.prompt || target?.metadata?.prompt }), generationStage: "已确认，正在创建任务" },
                });
            }
            const next = applyCanvasAgentOps(
                before,
                structuralOps,
            );
            nodesRef.current = next.nodes;
            connectionsRef.current = next.connections;
            selectedNodeIdsRef.current = new Set(next.selectedNodeIds);
            viewportRef.current = next.viewport;
            setAgentUndoSnapshot(before);
            setNodes(next.nodes);
            setConnections(next.connections);
            setSelectedNodeIds(new Set(next.selectedNodeIds));
            setSelectedConnectionId(null);
            setViewport(next.viewport);
            setContextMenu(null);
            if (generationOps.length) {
                scheduleAfterCanvasPaint(() =>
                    generationOps.forEach((op) => {
                        const target = nodesRef.current.find((node) => node.id === op.nodeId);
                        const prompt = op.prompt?.trim() ? op.prompt : (target?.metadata?.composerContent ?? target?.metadata?.prompt ?? "");
                        void generateNodeRef.current?.(op.nodeId, op.mode || target?.metadata?.generationMode || "image", prompt);
                    }),
                );
            }
            return { ...next, projectId, title: projectTitle };
        },
        [projectTitle, projectId],
    );
    const undoAgentOps = useCallback(() => {
        if (!agentUndoSnapshot) return null;
        nodesRef.current = agentUndoSnapshot.nodes;
        connectionsRef.current = agentUndoSnapshot.connections;
        selectedNodeIdsRef.current = new Set(agentUndoSnapshot.selectedNodeIds);
        viewportRef.current = agentUndoSnapshot.viewport;
        setNodes(agentUndoSnapshot.nodes);
        setConnections(agentUndoSnapshot.connections);
        setSelectedNodeIds(new Set(agentUndoSnapshot.selectedNodeIds));
        setSelectedConnectionId(null);
        setViewport(agentUndoSnapshot.viewport);
        setContextMenu(null);
        setAgentUndoSnapshot(null);
        return { ...agentUndoSnapshot, projectId, title: projectTitle };
    }, [agentUndoSnapshot, projectTitle, projectId]);

    const publishedContext = useMemo(() => createAgentCanvasContext(agentSnapshot, applyAgentOps, undoAgentOps, Boolean(agentUndoSnapshot)), [agentSnapshot, applyAgentOps, agentUndoSnapshot, undoAgentOps]);

    useEffect(() => {
        publishedContextRef.current = publishedContext;
        setAgentCanvasContext(publishedContext);
    }, [publishedContext, setAgentCanvasContext]);

    useEffect(
        () => () => {
            // Only the bridge instance that still owns the store value may clear it.
            // Snapshot updates must never publish a transient null/default canvas.
            if (useAgentStore.getState().canvasContext === publishedContextRef.current) setAgentCanvasContext(null);
        },
        [setAgentCanvasContext],
    );

    return { applyAgentOps };
}

function createAgentCanvasContext(snapshot: CanvasAgentSnapshot, applyOps: (ops?: CanvasAgentOp[]) => CanvasAgentSnapshot, undoOps: () => CanvasAgentSnapshot | null, canUndo: boolean) {
    return { snapshot, applyOps, undoOps, canUndo };
}

function scheduleAfterCanvasPaint(callback: () => void) {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(callback);
        return;
    }
    setTimeout(callback, 0);
}
