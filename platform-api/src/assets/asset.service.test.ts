import assert from "node:assert/strict";
import test from "node:test";
import { AssetKind, type Asset } from "@prisma/client";
import { BadRequestException, ConflictException } from "@nestjs/common";

import type { PrismaService } from "../prisma/prisma.service";
import type { WorkspaceService } from "../workspaces/workspace.service";
import { AssetService, serializeAsset } from "./asset.service";

const validInput = { kind: AssetKind.TEXT, title: "分镜提示词", coverUrl: "", tags: ["故事板"], source: "测试", note: "", data: { content: "内容" } };
const workspaces = { resolve: async () => ({ id: "workspace-a" }) } as unknown as WorkspaceService;

test("资产列表始终附带当前 workspaceId 条件", async () => {
    let capturedWhere: unknown;
    const prisma = {
        asset: {
            count: async ({ where }: { where: unknown }) => { capturedWhere = where; return 0; },
            findMany: async () => [],
        },
    } as unknown as PrismaService;
    const service = new AssetService(prisma, workspaces);
    await service.list("user-a", "team-a", { page: 1, limit: 100 });
    assert.deepEqual(capturedWhere, { workspaceId: "workspace-a" });
});

test("不同空间不能覆盖同一资产编号", async () => {
    const prisma = { asset: { findUnique: async () => ({ id: "asset-db-id", workspaceId: "workspace-other" }) } } as unknown as PrismaService;
    const service = new AssetService(prisma, workspaces);
    await assert.rejects(() => service.upsert("user-b", "team-a", "asset_public_01", validInput), ConflictException);
});

test("资产 API 拒绝把大媒体内容塞进 JSON 元数据", async () => {
    const prisma = { asset: { findUnique: async () => null } } as unknown as PrismaService;
    const service = new AssetService(prisma, workspaces);
    await assert.rejects(() => service.upsert("user-a", "team-a", "asset_public_02", { ...validInput, data: { content: "x".repeat(101 * 1024) } }), BadRequestException);
});

test("官方生成图片在资产列表中使用登录保护的同源地址", () => {
    const now = new Date();
    const asset = {
        id: "asset-db-id",
        publicId: "AST12345678",
        userId: "user-a",
        kind: AssetKind.IMAGE,
        title: "Image 2 生成图",
        coverUrl: null,
        tags: ["image"],
        source: "官方模型生成",
        note: null,
        data: { dataUrl: "https://metajing.cn/video-media/images/example.png", mimeType: "image/png" },
        metadata: null,
        generationJobId: "job-db-id",
        ordinal: 0,
        createdAt: now,
        updatedAt: now,
    } as Asset;

    const output = serializeAsset(asset);
    assert.equal(output.coverUrl, "/platform-api/providers/assets/AST12345678/content");
    assert.equal((output.data as Record<string, unknown>).dataUrl, "/platform-api/providers/assets/AST12345678/content");
});
