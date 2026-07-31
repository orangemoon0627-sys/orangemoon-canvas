import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";

import type { PrismaService } from "../prisma/prisma.service";
import { CanvasProjectService } from "./canvas-project.service";

const now = "2026-07-31T03:00:00.000Z";
const input = { title: "封神斗法", createdAt: now, updatedAt: now, data: { nodes: [], connections: [] } };

test("画布项目列表始终按当前账户隔离", async () => {
    let capturedWhere: unknown;
    const prisma = { canvasProject: { findMany: async ({ where }: { where: unknown }) => { capturedWhere = where; return []; } } } as unknown as PrismaService;
    await new CanvasProjectService(prisma).list("user-a");
    assert.deepEqual(capturedWhere, { userId: "user-a" });
});

test("旧标签页不能覆盖更新的云端画布", async () => {
    const existing = { clientUpdatedAt: new Date("2026-07-31T04:00:00.000Z") };
    let wrote = false;
    const prisma = {
        canvasProject: {
            updateMany: async () => ({ count: 0 }),
            findUnique: async () => existing,
            create: async () => { wrote = true; return existing; },
        },
    } as unknown as PrismaService;
    const result = await new CanvasProjectService(prisma).upsert("user-a", "canvas_12345678", input);
    assert.equal(result, existing);
    assert.equal(wrote, false);
});

test("画布 JSON 拒绝内嵌超大媒体内容", async () => {
    const prisma = { canvasProject: { findUnique: async () => null } } as unknown as PrismaService;
    await assert.rejects(
        () => new CanvasProjectService(prisma).upsert("user-a", "canvas_12345678", { ...input, data: { content: "x".repeat(8 * 1024 * 1024 + 1) } }),
        BadRequestException,
    );
});

test("删除不存在的画布也会创建账户级墓碑", async () => {
    let created: Record<string, unknown> | undefined;
    const prisma = {
        canvasProject: {
            updateMany: async () => ({ count: 0 }),
            findUnique: async () => null,
            create: async ({ data }: { data: Record<string, unknown> }) => { created = data; return data; },
        },
    } as unknown as PrismaService;
    await new CanvasProjectService(prisma).remove("user-a", "canvas_12345678", { deletedAt: now });
    assert.equal(created?.userId, "user-a");
    assert.equal(created?.publicId, "canvas_12345678");
    assert.ok(created?.deletedAt instanceof Date);
});

test("显式删除在时间戳相等时优先于当前画布快照", async () => {
    const existing = { id: "db-project", clientUpdatedAt: new Date(now) };
    let updateWhere: Record<string, unknown> | undefined;
    const prisma = {
        canvasProject: {
            updateMany: async ({ where }: { where: Record<string, unknown> }) => { updateWhere = where; return { count: 1 }; },
            findUnique: async () => ({ ...existing, deletedAt: new Date(now) }),
        },
    } as unknown as PrismaService;
    const result = await new CanvasProjectService(prisma).remove("user-a", "canvas_12345678", { deletedAt: now });
    assert.deepEqual(updateWhere, { userId: "user-a", publicId: "canvas_12345678", clientUpdatedAt: { lte: new Date(now) } });
    assert.ok(result.deletedAt instanceof Date);
});

test("画布更新使用数据库时间戳条件防止并发旧写入", async () => {
    let updateWhere: Record<string, unknown> | undefined;
    const stored = { id: "db-project", clientUpdatedAt: new Date(now) };
    const prisma = {
        canvasProject: {
            updateMany: async ({ where }: { where: Record<string, unknown> }) => { updateWhere = where; return { count: 1 }; },
            findUnique: async () => stored,
        },
    } as unknown as PrismaService;
    const result = await new CanvasProjectService(prisma).upsert("user-a", "canvas_12345678", input);
    assert.deepEqual(updateWhere, { userId: "user-a", publicId: "canvas_12345678", clientUpdatedAt: { lt: new Date(now) } });
    assert.equal(result, stored);
});
