import assert from "node:assert/strict";
import test from "node:test";

import { mergeCanvasProjects, portableProjectData } from "./canvas-cloud-sync";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";

const project = (id: string, updatedAt: string, title: string): CanvasProject => ({
    id,
    title,
    createdAt: "2026-07-31T01:00:00.000Z",
    updatedAt,
    nodes: [],
    connections: [],
    chatSessions: [],
    activeChatId: null,
    backgroundMode: "lines",
    showImageInfo: false,
    viewport: { x: 0, y: 0, k: 1 },
});

test("画布合并保留更新时间更晚的云端版本", () => {
    const result = mergeCanvasProjects(
        [project("canvas-a", "2026-07-31T03:00:00.000Z", "云端新版")],
        [],
        [project("canvas-a", "2026-07-31T02:00:00.000Z", "本地旧版")],
        [],
    );
    assert.equal(result.projects[0].title, "云端新版");
    assert.equal(result.uploadProjects.length, 0);
});

test("首次登录会把仅存在于浏览器的旧画布列入上传队列", () => {
    const local = project("canvas-local", "2026-07-31T02:00:00.000Z", "旧域名画布");
    const result = mergeCanvasProjects([], [], [local], []);
    assert.deepEqual(result.projects, [local]);
    assert.deepEqual(result.uploadProjects, [local]);
});

test("较新的云端删除墓碑不会被旧浏览器项目复活", () => {
    const result = mergeCanvasProjects(
        [],
        [{ id: "canvas-a", deletedAt: "2026-07-31T04:00:00.000Z" }],
        [project("canvas-a", "2026-07-31T03:00:00.000Z", "旧标签页")],
        [],
    );
    assert.equal(result.projects.length, 0);
    assert.equal(result.deletedProjects[0].id, "canvas-a");
    assert.equal(result.uploadProjects.length, 0);
});

test("删除墓碑与画布时间戳相等时删除优先", () => {
    const timestamp = "2026-07-31T03:00:00.000Z";
    const result = mergeCanvasProjects(
        [project("canvas-a", timestamp, "云端快照")],
        [],
        [],
        [{ id: "canvas-a", deletedAt: timestamp }],
    );
    assert.equal(result.projects.length, 0);
    assert.equal(result.deletedProjects[0]?.id, "canvas-a");
    assert.equal(result.uploadDeletions[0]?.id, "canvas-a");
});

test("未转存的本地媒体不会被静默丢弃后上传", () => {
    const local = project("canvas-a", "2026-07-31T03:00:00.000Z", "媒体画布");
    local.nodes = [{ id: "node-a", type: "image", metadata: { content: "blob:http://localhost/image-a" } }] as unknown as CanvasProject["nodes"];
    assert.throws(() => portableProjectData(local), /未完成存储的本地媒体/);
});

test("已有云端媒体的本地预览地址不会阻塞画布保存", () => {
    const local = project("canvas-a", "2026-07-31T03:00:00.000Z", "云端媒体画布");
    local.nodes = [
        {
            id: "image-a",
            type: "image",
            title: "云端图片",
            position: { x: 0, y: 0 },
            width: 100,
            height: 100,
            metadata: { content: "blob:https://canvas.orangemoon.tech/image-a", storageKey: "image:cloud-image-a" },
        },
    ];
    local.chatSessions = [
        {
            id: "chat-a",
            title: "测试对话",
            createdAt: local.createdAt,
            updatedAt: local.updatedAt,
            messages: [
                {
                    id: "message-a",
                    role: "user",
                    text: "继续",
                    references: [{ id: "reference-a", type: "image", title: "云端图片", dataUrl: "blob:https://canvas.orangemoon.tech/reference-a", storageKey: "image:cloud-image-a" }],
                },
            ],
        },
    ];

    const portable = portableProjectData(local);
    const nodeMetadata = (portable.nodes as Array<{ metadata?: Record<string, unknown> }>)[0].metadata;
    const reference = ((portable.chatSessions as Array<{ messages: Array<{ references?: Array<Record<string, unknown>> }> }>)[0].messages[0].references || [])[0];

    assert.equal(nodeMetadata?.content, undefined);
    assert.equal(nodeMetadata?.storageKey, "image:cloud-image-a");
    assert.equal(reference?.dataUrl, undefined);
    assert.equal(reference?.storageKey, "image:cloud-image-a");
    assert.doesNotThrow(() => JSON.stringify(portable));
    assert.equal(JSON.stringify(portable).includes("blob:"), false);
});
