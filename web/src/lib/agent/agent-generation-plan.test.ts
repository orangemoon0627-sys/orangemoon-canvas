import assert from "node:assert/strict";
import test from "node:test";

import { buildAgentGenerationPlan, generationQuoteItems, synchronizeAgentGenerationOps, updateAgentGenerationOps } from "./agent-generation-plan";
import type { CanvasAgentOp } from "@/lib/canvas/canvas-agent-ops";

const defaults = {
    imageModel: "orangemoon-official::gpt-image-2",
    videoModel: "orangemoon-official::qy-seedance-2.0",
    audioModel: "orangemoon-official::speech-2.8-hd",
    imageSize: "1:1",
    imageQuality: "auto",
    imageCount: 1,
    videoSize: "16:9",
    videoSeconds: 5,
    videoResolution: "720",
};

test("builds editable image and video review items from a workflow", () => {
    const ops: CanvasAgentOp[] = [
        { type: "add_node", id: "prompt", nodeType: "text", title: "镜头提示", metadata: { content: "杨戬与闻仲斗法" }, position: { x: 0, y: 0 } },
        { type: "add_node", id: "image", nodeType: "config", title: "角色图", metadata: { generationMode: "image", count: 2, size: "9:16" }, position: { x: 400, y: 0 } },
        { type: "add_node", id: "video", nodeType: "config", title: "镜头视频", metadata: { generationMode: "video", model: "mg-seedance2.0 -720p pro", seconds: "15", size: "16:9" }, position: { x: 800, y: 0 } },
        { type: "connect_nodes", fromNodeId: "prompt", toNodeId: "image" },
        { type: "run_generation", nodeId: "image", mode: "image" },
        { type: "run_generation", nodeId: "video", mode: "video" },
    ];

    const plan = buildAgentGenerationPlan(ops, null, defaults);
    assert.equal(plan.length, 2);
    assert.deepEqual(plan.map((item) => [item.mode, item.model, item.size]), [
        ["image", "gpt-image-2", "9:16"],
        ["video", "qy-seedance-2.0", "16:9"],
    ]);
    assert.equal(plan[1]?.resolution, "720p");
    assert.deepEqual(generationQuoteItems(plan).map(({ model, quantity }) => ({ model, quantity })), [
        { model: "gpt-image-2", quantity: 2 },
        { model: "qy-seedance-2.0", quantity: 15 },
    ]);
});

test("updates generated config metadata before run_generation", () => {
    const ops: CanvasAgentOp[] = [{ type: "run_generation", nodeId: "existing", mode: "video" }];
    const next = updateAgentGenerationOps(ops, "existing", { model: "qy-seedance-2.0-fast", seconds: "10" });
    assert.deepEqual(next, [
        { type: "update_node", id: "existing", metadata: { model: "qy-seedance-2.0-fast", seconds: "10" } },
        { type: "run_generation", nodeId: "existing", mode: "video" },
    ]);
});

test("normalizes common Agent model labels to billable official model ids", () => {
    const ops: CanvasAgentOp[] = [
        { type: "add_node", id: "image", nodeType: "config", metadata: { generationMode: "image", model: "Image 2" }, position: { x: 0, y: 0 } },
        { type: "add_node", id: "video", nodeType: "config", metadata: { generationMode: "video", model: "Seedance 2.0" }, position: { x: 400, y: 0 } },
        { type: "run_generation", nodeId: "image", mode: "image" },
        { type: "run_generation", nodeId: "video", mode: "video" },
    ];

    assert.deepEqual(buildAgentGenerationPlan(ops, null, defaults).map((item) => item.model), ["gpt-image-2", "qy-seedance-2.0"]);
});

test("writes normalized review values back to the executable workflow", () => {
    const ops: CanvasAgentOp[] = [
        { type: "add_node", id: "image", nodeType: "config", metadata: { generationMode: "image", model: "Image 2" }, position: { x: 0, y: 0 } },
        { type: "add_node", id: "video", nodeType: "config", metadata: { generationMode: "video", model: "Seedance 2.0" }, position: { x: 400, y: 0 } },
        { type: "run_generation", nodeId: "image", mode: "image" },
        { type: "run_generation", nodeId: "video", mode: "video" },
    ];
    const plan = buildAgentGenerationPlan(ops, null, defaults);
    const next = synchronizeAgentGenerationOps(ops, plan);
    const nodes = next?.filter((op) => op.type === "add_node") || [];

    assert.equal(nodes[0]?.metadata?.model, "gpt-image-2");
    assert.equal(nodes[1]?.metadata?.model, "qy-seedance-2.0");
    assert.equal(nodes[1]?.metadata?.seconds, "5");
    assert.equal(nodes[1]?.metadata?.vquality, "720");
});
