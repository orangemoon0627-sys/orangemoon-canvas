import assert from "node:assert/strict";
import test from "node:test";

import { extractFunctionCalls, extractResponseText, runCloudAgentTurn } from "./cloud-agent.js";

test("extracts Terra text and supported function calls", () => {
    const response = {
        output: [
            { type: "message", content: [{ type: "output_text", text: "方案已完成" }] },
            { type: "function_call", call_id: "call-1", name: "canvas_get_state", arguments: "{}" },
            { type: "function_call", call_id: "call-2", name: "unknown_tool", arguments: "{}" },
        ],
    };
    assert.equal(extractResponseText(response), "方案已完成");
    assert.deepEqual(extractFunctionCalls(response), [{ callId: "call-1", name: "canvas_get_state", arguments: "{}" }]);
});

test("runs a Responses API tool round and returns accumulated usage", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const responses = [
        {
            id: "response-1",
            output: [{ type: "function_call", call_id: "call-1", name: "canvas_get_state", arguments: "{}" }],
            usage: { input_tokens: 10, input_tokens_details: { cached_tokens: 4 }, output_tokens: 2, total_tokens: 12 },
        },
        {
            id: "response-2",
            output: [{ type: "message", content: [{ type: "output_text", text: "画布读取完成" }] }],
            usage: { input_tokens: 8, output_tokens: 4, total_tokens: 12 },
        },
    ];
    const result = await runCloudAgentTurn({
        prompt: "读取画布",
        creativeMode: "direct",
        client: {
            create: async (body) => {
                requests.push(body);
                const response = responses.shift();
                if (!response) throw new Error("unexpected request");
                return response;
            },
        },
        executeTool: async (name, input) => {
            assert.equal(name, "canvas_get_state");
            assert.deepEqual(input, {});
            return { nodes: [], connections: [] };
        },
    });

    assert.equal(result.text, "画布读取完成");
    assert.deepEqual(result.usage, { input_tokens: 18, cached_input_tokens: 4, output_tokens: 6, total_tokens: 24 });
    assert.equal(requests.length, 2);
    const secondInput = requests[1].input as Array<Record<string, unknown>>;
    assert.ok(secondInput.some((item) => item.type === "function_call_output" && item.call_id === "call-1"));
});

test("a project-bound Terra turn cannot see navigation or workbench generation tools", async () => {
    let request: Record<string, unknown> | undefined;
    await runCloudAgentTurn({
        prompt: "在当前画布创建图片流程",
        creativeMode: "vibe",
        projectId: "canvas-locked",
        client: {
            create: async (body) => {
                request = body;
                return { output_text: "请审核当前画布方案", usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
            },
        },
        executeTool: async () => ({ ok: true }),
    });

    const names = ((request?.tools || []) as Array<{ name: string }>).map((tool) => tool.name);
    assert.equal(names.includes("site_navigate"), false);
    assert.equal(names.includes("canvas_list_projects"), false);
    assert.equal(names.includes("workbench_image_generate"), false);
    assert.equal(names.includes("workbench_video_generate"), false);
    assert.equal(names.includes("canvas_create_generation_flow"), true);
    assert.equal(names.includes("canvas_get_node"), true);
    assert.equal(names.includes("canvas_update_node_text"), true);
    assert.equal(names.includes("creative_skills_list"), true);
    assert.equal(names.includes("creative_skill_get"), true);
});
