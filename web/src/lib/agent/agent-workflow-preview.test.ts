import assert from "node:assert/strict";
import test from "node:test";

import { buildAgentWorkflowPreview } from "./agent-workflow-preview";
import type { CanvasAgentOp } from "@/lib/canvas/canvas-agent-ops";

test("ignores read-only and non-batch tools", () => {
    assert.equal(buildAgentWorkflowPreview("canvas_get_state", []), null);
});

test("summarizes a complete image-to-video workflow", () => {
    const ops: CanvasAgentOp[] = [
        { type: "add_node", id: "story", nodeType: "text", title: "故事脚本", position: { x: 0, y: 0 } },
        { type: "add_node", id: "character", nodeType: "image", title: "人物设定", position: { x: 360, y: 0 }, metadata: { generationMode: "image" } },
        { type: "add_node", id: "video", nodeType: "video", title: "成片镜头", position: { x: 720, y: 0 }, metadata: { generationMode: "video" } },
        { type: "connect_nodes", fromNodeId: "story", toNodeId: "character" },
        { type: "connect_nodes", fromNodeId: "character", toNodeId: "video" },
        { type: "run_generation", nodeId: "character", mode: "image" },
        { type: "run_generation", nodeId: "video", mode: "video" },
    ];

    const preview = buildAgentWorkflowPreview("canvas_apply_ops", ops);

    assert.equal(preview?.title, "审核创作方案");
    assert.deepEqual(preview?.stats, [
        { label: "节点", value: 3 },
        { label: "连线", value: 2 },
        { label: "生成", value: 2 },
    ]);
    assert.deepEqual(
        preview?.stages.map((stage) => stage.label),
        ["素材与提示", "图片生成", "视频生成", "流程连接"],
    );
    assert.equal(preview?.destructive, false);
});

test("marks destructive changes for explicit review", () => {
    const preview = buildAgentWorkflowPreview("canvas_apply_ops", [{ type: "delete_node", ids: ["old-a", "old-b"] }]);

    assert.equal(preview?.destructive, true);
    assert.match(preview?.summary || "", /删除/);
});
