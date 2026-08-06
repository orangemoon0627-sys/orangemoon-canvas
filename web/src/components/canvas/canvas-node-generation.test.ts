import assert from "node:assert/strict";
import test from "node:test";

import { buildNodeGenerationContext } from "./canvas-node-generation";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";

const nodes: CanvasNodeData[] = [
    node("config", CanvasNodeType.Config, { composerContent: "生成视频" }),
    node("image-1", CanvasNodeType.Image, { content: "data:image/png;base64,one", mimeType: "image/png" }),
    node("image-2", CanvasNodeType.Image, { content: "data:image/png;base64,two", mimeType: "image/png" }),
    node("text-1", CanvasNodeType.Text, { content: "保持火焰山的空间关系" }),
];

const connections: CanvasConnection[] = [connection("image-1", "config"), connection("image-2", "config"), connection("text-1", "config")];

test("配置节点未写显式引用时默认携带所有已连线素材", () => {
    const context = buildNodeGenerationContext("config", nodes, connections, "生成视频");

    assert.deepEqual(
        context.referenceImages.map((image) => image.id),
        ["image-1", "image-2"],
    );
    assert.match(context.prompt, /生成视频/);
    assert.match(context.prompt, /保持火焰山的空间关系/);
    assert.deepEqual({ text: context.textCount, image: context.imageCount }, { text: 1, image: 2 });
});

test("配置节点写了显式引用时只携带被选中的素材", () => {
    const context = buildNodeGenerationContext("config", nodes, connections, "使用 @[node:image-2]，并遵循 @[node:text-1]");

    assert.deepEqual(
        context.referenceImages.map((image) => image.id),
        ["image-2"],
    );
    assert.match(context.prompt, /图片1/);
    assert.match(context.prompt, /【文本1】/);
    assert.doesNotMatch(context.prompt, /image-2/);
    assert.deepEqual({ text: context.textCount, image: context.imageCount }, { text: 1, image: 1 });
});

function node(id: string, type: CanvasNodeType, metadata: NonNullable<CanvasNodeData["metadata"]>): CanvasNodeData {
    return { id, type, title: id, position: { x: 0, y: 0 }, width: 320, height: 240, metadata };
}

function connection(fromNodeId: string, toNodeId: string): CanvasConnection {
    return { id: `${fromNodeId}-${toNodeId}`, fromNodeId, toNodeId };
}
