import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException } from "@nestjs/common";

import type { PrismaService } from "../prisma/prisma.service";
import type { WorkspaceService } from "../workspaces/workspace.service";
import { AgentThreadService, normalizeMessages } from "./agent-thread.service";

const workspaces = { resolve: async () => ({ id: "workspace-a" }) } as unknown as WorkspaceService;

test("Agent 对话列表始终按账户和画布隔离", async () => {
    const captured: unknown[] = [];
    const prisma = {
        agentThread: {
            findMany: async ({ where }: { where: unknown }) => { captured.push(where); return []; },
            findFirst: async ({ where }: { where: unknown }) => { captured.push(where); return null; },
        },
    } as unknown as PrismaService;
    const service = new AgentThreadService(prisma, workspaces);
    await service.list("user-a", "team-a", { projectId: "canvas-a" });
    assert.deepEqual(captured, [{ workspaceId: "workspace-a", projectId: "canvas-a" }, { workspaceId: "workspace-a", projectId: "canvas-a" }]);
});

test("持久化消息会移除图片 dataUrl，只保留附件元数据", () => {
    const messages = normalizeMessages([
        {
            id: "m1",
            role: "user",
            text: "参考这张图",
            attachments: [{ id: "a1", name: "ref.png", type: "image/png", size: 12, width: 10, height: 20, dataUrl: "data:image/png;base64,secret" }],
        },
    ]) as Array<Record<string, unknown>>;
    const attachment = (messages[0].attachments as Array<Record<string, unknown>>)[0];
    assert.equal(attachment.name, "ref.png");
    assert.equal("dataUrl" in attachment, false);
});

test("不同空间不能覆盖同一个 Agent 对话编号", async () => {
    const prisma = { agentThread: { findUnique: async () => ({ workspaceId: "workspace-other", projectId: "canvas-a" }) } } as unknown as PrismaService;
    const service = new AgentThreadService(prisma, workspaces);
    await assert.rejects(() => service.upsert("user-b", "team-a", "thread-1", { projectId: "canvas-a", messages: [], history: [] }), ConflictException);
});
