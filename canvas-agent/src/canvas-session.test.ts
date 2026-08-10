import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
import assert from "node:assert/strict";
import test from "node:test";

import { CanvasSession } from "./canvas-session.js";

test("MCP 读取当前激活网页的画布", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    t.after(() => {
        first.close();
        second.close();
    });
    session.updateState(snapshot("canvas-first"), "first");
    session.updateState(snapshot("canvas-second"), "second");

    session.activateClient("first");
    assert.equal(field(await session.callTool("canvas_get_state", {}), "projectId"), "canvas-first");

    session.activateClient("second");
    assert.equal(field(await session.callTool("canvas_get_state", {}), "projectId"), "canvas-second");
});

test("画布写操作只发送给当前激活网页", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    t.after(() => {
        first.close();
        second.close();
    });
    session.updateState(snapshot("canvas-first"), "first");
    session.updateState(snapshot("canvas-second"), "second");
    session.activateClient("second");

    const result = session.callTool("canvas_create_text_node", { text: "只写入第二个画布" });
    const call = second.event("tool_call");
    assert.equal(first.event("tool_call"), undefined);
    assert.equal(field(call, "name"), "canvas_apply_ops");
    session.resolveResult("second", { requestId: String(field(call, "requestId")), result: { ok: true } });
    assert.deepEqual(await result, { ok: true });
});

test("单个或选中的文本节点会返回完整可编辑内容", async (t) => {
    const session = new CanvasSession();
    const client = connect(session, "first");
    t.after(() => client.close());
    const content = "完整正文".repeat(120);
    session.updateState(
        {
            ...snapshot("canvas-first"),
            nodes: [{ id: "text-1", type: "text", title: "故事梗概", position: { x: 0, y: 0 }, width: 320, height: 240, metadata: { content } }],
            selectedNodeIds: ["text-1"],
        },
        "first",
    );

    const state = await session.callTool("canvas_get_state", {});
    const compactContent = ((field(state, "nodes") as Array<Record<string, unknown>>)[0].metadata as Record<string, unknown>).content;
    assert.notEqual(compactContent, content);

    const selected = await session.callTool("canvas_get_selection", {});
    const selectedContent = (((field(selected, "nodes") as Array<Record<string, unknown>>)[0].metadata as Record<string, unknown>).content);
    assert.equal(selectedContent, content);

    const result = await session.callTool("canvas_get_node", { id: "text-1" });
    const node = field(result, "node") as Record<string, unknown>;
    assert.equal((node.metadata as Record<string, unknown>).content, content);
});

test("只修改文本节点标题时不会覆盖正文", async (t) => {
    const session = new CanvasSession();
    const client = connect(session, "first");
    t.after(() => client.close());

    const result = session.callTool("canvas_update_node_text", { id: "text-1", title: "第三幕" });
    const call = client.event("tool_call");
    const op = ((field(call, "input") as Record<string, unknown>).ops as Array<Record<string, unknown>>)[0];
    assert.deepEqual(op, { type: "update_node", id: "text-1", patch: { title: "第三幕" } });
    session.resolveResult("first", { requestId: String(field(call, "requestId")), result: { ok: true } });
    assert.deepEqual(await result, { ok: true });
});

test("修改文本节点正文时保留标题并拒绝空更新", async (t) => {
    const session = new CanvasSession();
    const client = connect(session, "first");
    t.after(() => client.close());

    const result = session.callTool("canvas_update_node_text", { id: "text-1", text: "迭代后的正文" });
    const call = client.event("tool_call");
    const op = ((field(call, "input") as Record<string, unknown>).ops as Array<Record<string, unknown>>)[0];
    assert.deepEqual(op, { type: "update_node", id: "text-1", metadata: { content: "迭代后的正文", status: "success" } });
    session.resolveResult("first", { requestId: String(field(call, "requestId")), result: { ok: true } });
    assert.deepEqual(await result, { ok: true });

    await assert.rejects(session.callTool("canvas_update_node_text", { id: "text-1" }), /至少需要提供 text 或 title/);
});

test("当前 turn 的图片附件可在发起标签页画布创建图片节点", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    t.after(() => first.close());
    const dataUrl = "data:image/png;base64,aW1hZ2U=";
    session.setTurnAttachments("first", [{ id: "attachment-1", name: "商品.png", type: "image/png", size: 5, width: 1200, height: 600, dataUrl }]);
    session.bindClient("first");

    const result = session.callTool("canvas_create_attachment_nodes", { attachmentIds: ["attachment-1"], x: 100, y: 200 });
    const call = first.event("tool_call");
    const input = field(call, "input") as Record<string, unknown>;
    const nodes = input.nodes as Array<Record<string, unknown>>;
    assert.equal(field(call, "name"), "canvas_create_attachment_nodes");
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].attachmentId, "attachment-1");
    assert.equal(nodes[0].title, "商品.png");
    assert.deepEqual(nodes[0].position, { x: 100, y: 200 });
    assert.equal(nodes[0].width, 640);
    assert.equal(nodes[0].height, 320);
    assert.equal("dataUrl" in nodes[0], false);
    assert.equal(session.getTurnAttachment("first", "attachment-1").dataUrl, dataUrl);

    session.resolveResult("first", { requestId: String(field(call, "requestId")), result: { ok: true } });
    const created = (await result) as { nodes: Array<{ id: string; attachmentId: string; title: string }> };
    assert.equal(created.nodes[0].id, nodes[0].id);
    assert.equal(created.nodes[0].attachmentId, "attachment-1");
    session.clearTurnAttachments("first");
    assert.throws(() => session.getTurnAttachment("first", "attachment-1"), /找不到/);
});

test("图片附件只允许发起 turn 的标签页读取和落入画布", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    t.after(() => {
        first.close();
        second.close();
    });
    session.setTurnAttachments("first", [{ id: "attachment-1", name: "商品.png", type: "image/png", dataUrl: "data:image/png;base64,aW1hZ2U=" }]);
    session.bindClient("second");

    await assert.rejects(session.callTool("canvas_create_attachment_nodes", { attachmentIds: ["attachment-1"] }), /发起标签页/);
    assert.throws(() => session.getTurnAttachment("second", "attachment-1"), /发起标签页/);
    assert.equal(first.event("tool_call"), undefined);
    assert.equal(second.event("tool_call"), undefined);
});

test("tool result is accepted only from the request client", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    t.after(() => {
        first.close();
        second.close();
    });
    session.activateClient("first");

    const result = session.callTool("canvas_create_text_node", { text: "first only" });
    const call = first.event("tool_call");
    const requestId = String(field(call, "requestId"));

    assert.equal(session.resolveResult("second", { requestId, result: { client: "second" } }), false);
    assert.equal(session.resolveResult("first", { requestId, result: { client: "first" } }), true);
    assert.deepEqual(await result, { client: "first" });
});

test("生成状态查询由当前激活网页返回", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    t.after(() => {
        first.close();
        second.close();
    });
    session.activateClient("second");

    const result = session.callTool("generation_get_status", { scope: "all" });
    const call = second.event("tool_call");
    assert.equal(first.event("tool_call"), undefined);
    assert.equal(field(call, "name"), "generation_get_status");
    session.resolveResult("second", { requestId: String(field(call, "requestId")), result: { total: 1, tasks: [{ id: "image-1", status: "running" }] } });
    assert.deepEqual(await result, { total: 1, tasks: [{ id: "image-1", status: "running" }] });
});

test("活动网页关闭后回退到仍连接的画布", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    t.after(() => {
        first.close();
        second.close();
    });
    session.updateState(snapshot("canvas-first"), "first");
    session.updateState(snapshot("canvas-second"), "second");
    session.activateClient("second");
    second.close();

    assert.equal(field(await session.callTool("canvas_get_state", {}), "projectId"), "canvas-first");
});

test("closing the active client falls back to the most recently focused client", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    const third = connect(session, "third");
    t.after(() => {
        first.close();
        second.close();
        third.close();
    });
    session.updateState(snapshot("canvas-first"), "first");
    session.updateState(snapshot("canvas-second"), "second");
    session.updateState(snapshot("canvas-third"), "third");
    session.activateClient("third");
    session.activateClient("second");
    second.close();

    assert.equal(field(await session.callTool("canvas_get_state", {}), "projectId"), "canvas-third");
});

test("closing a client rejects its pending tool requests", async () => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const result = session.callTool("canvas_create_text_node", { text: "pending" });
    const call = first.event("tool_call");
    const requestId = String(field(call, "requestId"));
    first.close();

    const outcome = await Promise.race([
        result.then(() => "resolved", (error) => error instanceof Error ? error.message : String(error)),
        new Promise<string>((resolve) => setTimeout(() => resolve("pending"), 20)),
    ]);
    if (outcome === "pending") session.resolveResult("first", { requestId, result: null });
    assert.match(outcome, /断开/);
});

test("shared thread events are broadcast with the active thread id", (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    t.after(() => {
        first.close();
        second.close();
    });

    session.emitThread("workspace_changed", "thread-2", { activeThreadId: "thread-2" });

    assert.deepEqual(first.event("workspace_changed"), { activeThreadId: "thread-2", threadId: "thread-2" });
    assert.deepEqual(second.event("workspace_changed"), { activeThreadId: "thread-2", threadId: "thread-2" });
});

test("new clients receive the current Codex state and later updates", (t) => {
    const session = new CanvasSession();
    session.setCodexState({ busy: true, threadId: "thread-2", turnId: "turn-1" });
    const client = connect(session, "first");
    t.after(() => client.close());

    assert.deepEqual(field(client.event("hello"), "codex"), { busy: true, threadId: "thread-2", turnId: "turn-1" });

    session.setCodexState({ busy: false });
    assert.deepEqual(client.event("codex_state"), { busy: false, threadId: "thread-2", turnId: "turn-1" });
});

test("a bound client remains the tool target while focus changes", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    t.after(() => {
        first.close();
        second.close();
    });
    session.updateState(snapshot("canvas-first"), "first");
    session.updateState(snapshot("canvas-second"), "second");
    session.bindClient("first");
    session.activateClient("second");

    assert.equal(field(await session.callTool("canvas_get_state", {}), "projectId"), "canvas-first");
    const result = session.callTool("canvas_create_text_node", { text: "bound" });
    const call = first.event("tool_call");
    assert.equal(second.event("tool_call"), undefined);
    session.resolveResult("first", { requestId: String(field(call, "requestId")), result: { ok: true } });
    assert.deepEqual(await result, { ok: true });

    session.releaseClient("first");
    assert.equal(field(await session.callTool("canvas_get_state", {}), "projectId"), "canvas-second");
});

test("a turn bound to a project rejects navigation and a switched canvas", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    t.after(() => first.close());
    session.updateState(snapshot("canvas-first"), "first");
    session.bindClient("first", "canvas-first");

    await assert.rejects(session.callTool("site_navigate", { path: "/canvas/canvas-second" }), /锁定画布 canvas-first/);
    session.updateState(snapshot("canvas-second"), "first");
    await assert.rejects(session.callTool("canvas_get_state", {}), /只允许操作画布 canvas-first/);
    assert.equal(first.event("tool_call"), undefined);
});

test("project-bound tool calls include the expected project id", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    t.after(() => first.close());
    session.updateState(snapshot("canvas-first"), "first");
    session.bindClient("first", "canvas-first");

    const result = session.callTool("canvas_create_text_node", { text: "locked" });
    const call = first.event("tool_call");
    assert.equal(field(call, "projectId"), "canvas-first");
    session.resolveResult("first", { requestId: String(field(call, "requestId")), result: { ok: true } });
    assert.deepEqual(await result, { ok: true });
});

test("Agent 可创建完整导演台节点", async (t) => {
    const session = new CanvasSession();
    const client = connect(session, "first");
    t.after(() => client.close());
    session.updateState(snapshot("canvas-first"), "first");

    const result = session.callTool("canvas_create_director_scene", {
        title: "山门斗法",
        scene: {
            name: "山门斗法",
            duration: 8,
            cameras: [{ id: "camera-1", name: "全景", position: [6, 4, 9], target: [0, 1, 0], fov: 40 }],
            shots: [{ id: "shot-1", name: "建立冲突", cameraId: "camera-1", start: 0, end: 8, movement: "push-in" }],
        },
    });
    const call = client.event("tool_call");
    const ops = (field(call, "input") as { ops: Array<Record<string, unknown>> }).ops;
    assert.equal(ops[0].nodeType, "director");
    assert.equal(ops[0].title, "山门斗法");
    assert.equal(((ops[0].metadata as Record<string, unknown>).director as Record<string, unknown>).duration, 8);
    session.resolveResult("first", { requestId: String(field(call, "requestId")), result: { ok: true } });
    assert.deepEqual(await result, { ok: true });
});

test("Agent 原地迭代导演台并保留未修改场景字段", async (t) => {
    const session = new CanvasSession();
    const client = connect(session, "first");
    t.after(() => client.close());
    session.updateState({
        ...snapshot("canvas-first"),
        nodes: [{ id: "director-1", type: "director", title: "第一版", position: { x: 10, y: 20 }, width: 440, height: 280, metadata: { director: { name: "第一版", duration: 10 } } }],
    }, "first");

    const result = session.callTool("canvas_update_director_scene", { nodeId: "director-1", title: "第二版", scene: { name: "第二版", duration: 15 } });
    const call = client.event("tool_call");
    const op = (field(call, "input") as { ops: Array<Record<string, unknown>> }).ops[0];
    const scene = (op.metadata as Record<string, unknown>).director as Record<string, unknown>;
    assert.equal(op.id, "director-1");
    assert.equal((op.patch as Record<string, unknown>).title, "第二版");
    assert.equal(scene.duration, 15);
    assert.ok(Array.isArray(scene.objects));
    session.resolveResult("first", { requestId: String(field(call, "requestId")), result: { ok: true } });
    assert.deepEqual(await result, { ok: true });
});

test("Agent 可从导演台输出 Seedance 运镜文本节点", async (t) => {
    const session = new CanvasSession();
    const client = connect(session, "first");
    t.after(() => client.close());
    session.updateState({
        ...snapshot("canvas-first"),
        nodes: [{ id: "director-1", type: "director", title: "导演台", position: { x: 10, y: 20 }, width: 440, height: 280, metadata: { director: { name: "追逐", cameras: [{ id: "camera-1", name: "低机位", position: [3, 1, 7], target: [0, 1, 0], fov: 35 }], shots: [{ id: "shot-1", name: "逼近", cameraId: "camera-1", start: 0, end: 5, movement: "push-in" }] } } }],
    }, "first");

    const result = session.callTool("canvas_export_director_prompt", { nodeId: "director-1" });
    const call = client.event("tool_call");
    const ops = (field(call, "input") as { ops: Array<Record<string, unknown>> }).ops;
    assert.equal(ops[0].nodeType, "text");
    assert.match(String((ops[0].metadata as Record<string, unknown>).content), /镜头1/);
    assert.deepEqual({ fromNodeId: ops[1].fromNodeId, toNodeId: ops[1].toNodeId }, { fromNodeId: "director-1", toNodeId: ops[0].id });
    session.resolveResult("first", { requestId: String(field(call, "requestId")), result: { ok: true } });
    assert.deepEqual(await result, { ok: true });
});

test("closing the bound client falls back to the active client", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    t.after(() => {
        first.close();
        second.close();
    });
    session.updateState(snapshot("canvas-first"), "first");
    session.updateState(snapshot("canvas-second"), "second");
    session.bindClient("first");
    session.activateClient("second");
    first.close();

    assert.equal(field(await session.callTool("canvas_get_state", {}), "projectId"), "canvas-second");
    const result = session.callTool("canvas_create_text_node", { text: "fallback" });
    const call = second.event("tool_call");
    session.resolveResult("second", { requestId: String(field(call, "requestId")), result: { ok: true } });
    assert.deepEqual(await result, { ok: true });
});

function connect(session: CanvasSession, clientId: string) {
    const response = new FakeSseResponse();
    session.openEvents(new URL(`http://127.0.0.1/events?clientId=${clientId}`), response as unknown as ServerResponse);
    return response;
}

function snapshot(projectId: string) {
    return { projectId, title: projectId, nodes: [], connections: [], selectedNodeIds: [], viewport: { x: 0, y: 0, k: 1 } };
}

function field(value: unknown, key: string) {
    return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

class FakeSseResponse extends EventEmitter {
    private chunks: string[] = [];

    writeHead() {
        return this;
    }

    write(chunk: string) {
        this.chunks.push(chunk);
        return true;
    }

    event(type: string) {
        const chunk = this.chunks.find((item) => item.startsWith(`event: ${type}\n`));
        const data = chunk?.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
        return data ? (JSON.parse(data) as unknown) : undefined;
    }

    close() {
        this.emit("close");
    }
}
