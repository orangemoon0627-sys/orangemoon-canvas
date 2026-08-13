import { nanoid } from "nanoid";

import { DirectorStudio } from "@/components/director/director-studio";
import { imageMetadata } from "@/lib/canvas/canvas-node-factory";
import { isLikelyDirectorBackgroundAsset, isLikelyDirectorCharacterAsset } from "@/lib/director/director-scene";
import type { CanvasAgentOp } from "@/lib/canvas/canvas-agent-ops";
import { uploadImage } from "@/services/image-storage";
import { useDirectorStudioStore } from "@/stores/use-director-studio-store";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata } from "@/types/canvas";
import type { DirectorAsset, DirectorScene } from "@/types/director";

export function DirectorStudioHost({ nodes, connections, onUpdateMetadata, onApplyOps }: { nodes: CanvasNodeData[]; connections: CanvasConnection[]; onUpdateMetadata: (nodeId: string, metadata: CanvasNodeMetadata) => void; onApplyOps: (ops: CanvasAgentOp[]) => unknown }) {
    const nodeId = useDirectorStudioStore((state) => state.nodeId);
    const close = useDirectorStudioStore((state) => state.close);
    const node = nodes.find((item) => item.id === nodeId && item.type === CanvasNodeType.Director);
    if (!node) return null;

    const assets: DirectorAsset[] = nodes
        .filter((item) => (item.type === CanvasNodeType.Image || item.type === CanvasNodeType.Video) && Boolean(item.metadata?.content || item.metadata?.storageKey))
        .map((item) => ({
            id: item.id,
            nodeId: item.id,
            title: item.title || (item.type === CanvasNodeType.Image ? "图片素材" : "视频素材"),
            kind: item.type === CanvasNodeType.Image ? "image" : "video",
            url: item.metadata?.content,
            storageKey: item.metadata?.storageKey,
            mimeType: item.metadata?.mimeType,
            width: item.metadata?.naturalWidth,
            height: item.metadata?.naturalHeight,
            suggestedRole: inferDirectorAssetRole(item),
        }));

    const outputPosition = () => ({ x: node.position.x + node.width + 80, y: node.position.y + connections.filter((connection) => connection.fromNodeId === node.id).length * 380 });
    const save = (scene: DirectorScene) => onUpdateMetadata(node.id, { director: scene });
    const exportImage = async (scene: DirectorScene, blob: Blob) => {
        const image = await uploadImage(blob);
        const imageId = `image-${nanoid()}`;
        const ratio = aspectRatio(scene.aspectRatio);
        const width = 360;
        onApplyOps([
            { type: "update_node", id: node.id, metadata: { director: scene, ...imageMetadata(image) } },
            { type: "add_node", id: imageId, nodeType: CanvasNodeType.Image, title: `${scene.name} · 当前机位`, position: outputPosition(), width, height: Math.round(width / ratio), metadata: imageMetadata(image) },
            { type: "connect_nodes", fromNodeId: node.id, toNodeId: imageId },
            { type: "select_nodes", ids: [imageId] },
        ]);
    };
    const exportPrompt = (scene: DirectorScene, prompt: string) => {
        const textId = `text-${nanoid()}`;
        onApplyOps([
            { type: "update_node", id: node.id, metadata: { director: scene } },
            { type: "add_node", id: textId, nodeType: CanvasNodeType.Text, title: `${scene.name} · Seedance 运镜`, position: outputPosition(), width: 420, height: 360, metadata: { content: prompt, prompt, status: "success", fontSize: 13 } },
            { type: "connect_nodes", fromNodeId: node.id, toNodeId: textId },
            { type: "select_nodes", ids: [textId] },
        ]);
    };

    return <DirectorStudio initialScene={node.metadata?.director} assets={assets} onClose={close} onSave={save} onExportImage={exportImage} onExportPrompt={exportPrompt} />;
}

function inferDirectorAssetRole(node: CanvasNodeData): DirectorAsset["suggestedRole"] {
    const value = { name: node.title, title: node.metadata?.prompt };
    if (isLikelyDirectorCharacterAsset(value)) return "character";
    if (isLikelyDirectorBackgroundAsset(value)) return "background";
    return node.type === CanvasNodeType.Video ? "foreground" : "prop";
}

function aspectRatio(value: DirectorScene["aspectRatio"]) {
    const [width, height] = value.split(":").map(Number);
    return width / height || 16 / 9;
}
