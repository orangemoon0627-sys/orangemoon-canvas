import { toolInputSchemas, toolNames, type ToolName } from "./schemas.js";
import type { CanvasNode, CanvasSnapshot } from "./types.js";

const MAX_EDITABLE_TEXT_CHARS = 40_000;

export function isToolName(name: unknown): name is ToolName {
    return typeof name === "string" && toolNames.includes(name as ToolName);
}

export function parseToolInput(name: ToolName, input: unknown) {
    return toolInputSchemas[name].parse(input ?? {});
}

export function compactCanvasState(state: CanvasSnapshot | null) {
    if (!state) throw new Error("当前没有已连接画布");
    return { ...state, nodes: (state.nodes || []).map(compactNode) };
}

export function compactNode(node: CanvasNode) {
    const metadata = { ...(node.metadata || {}) };
    if (typeof metadata.content === "string" && metadata.content.length > 240) metadata.content = `${metadata.content.slice(0, 120)}...`;
    return { id: node.id, type: node.type, title: node.title, position: node.position, width: node.width, height: node.height, metadata };
}

export function editableNode(node: CanvasNode) {
    if (node.type !== "text") return compactNode(node);
    const metadata = { ...(node.metadata || {}) };
    const content = typeof metadata.content === "string" ? metadata.content : typeof metadata.prompt === "string" ? metadata.prompt : "";
    if (content.length > MAX_EDITABLE_TEXT_CHARS) {
        metadata.content = content.slice(0, MAX_EDITABLE_TEXT_CHARS);
        metadata.contentTruncated = true;
        metadata.contentLength = content.length;
    } else {
        metadata.content = content;
    }
    return { id: node.id, type: node.type, title: node.title, position: node.position, width: node.width, height: node.height, metadata };
}

export function nextCanvasX(state: CanvasSnapshot | null) {
    const nodes = state?.nodes || [];
    return nodes.length ? Math.max(...nodes.map((node) => node.position.x + node.width)) + 80 : 0;
}
