import assert from "node:assert/strict";
import test from "node:test";

import { BadGatewayException, BadRequestException, ServiceUnavailableException } from "@nestjs/common";

import type { PrismaService } from "../prisma/prisma.service";
import type { LedgerService } from "../wallet/ledger.service";
import { GenerationService, providerVideoTaskId, publicVideoGenerationError, rewriteGeneratedImageUrls, videoResultUrl } from "./generation.service";
import type { PricingService } from "./pricing.service";
import type { ProviderUpstreamService } from "./provider-upstream.service";
import type { WorkspaceService } from "../workspaces/workspace.service";

const workspaces = { resolve: async () => ({ id: "workspace-a" }) } as unknown as WorkspaceService;

test("供应商未配置时在冻结积分和创建任务前拒绝生图", async () => {
    let reservationAttempts = 0;
    const upstream = {
        assertConfigured(provider: string) {
            assert.equal(provider, "metajing");
            throw new ServiceUnavailableException("MetaJing 密钥尚未在服务端配置");
        },
    } as unknown as ProviderUpstreamService;
    const ledger = {
        runSerializable() {
            reservationAttempts += 1;
            throw new Error("不应进入积分预授权");
        },
    } as unknown as LedgerService;
    const service = new GenerationService({} as PrismaService, ledger, {} as PricingService, upstream, workspaces);

    await assert.rejects(
        service.image("user-1", "team-a", "image-preflight-1", {
            model: "gpt-image-2",
            prompt: "测试图片",
            size: "1024x1024",
            n: 1,
            images: [],
            response_format: "url",
            output_format: "png",
        }),
        (error: unknown) => error instanceof ServiceUnavailableException && error.message === "MetaJing 密钥尚未在服务端配置",
    );
    assert.equal(reservationAttempts, 0);
});

test("未登记的旧模型在配置检查和积分预授权前被拒绝", async () => {
    let upstreamChecks = 0;
    let reservationAttempts = 0;
    const upstream = {
        assertConfigured() {
            upstreamChecks += 1;
        },
    } as unknown as ProviderUpstreamService;
    const ledger = {
        runSerializable() {
            reservationAttempts += 1;
            throw new Error("不应进入积分预授权");
        },
    } as unknown as LedgerService;
    const service = new GenerationService({} as PrismaService, ledger, {} as PricingService, upstream, workspaces);

    await assert.rejects(
        service.createVideo("user-1", "team-a", "video-preflight-1", {
            model: "mg-seedance2.0 -720p fast",
            prompt: "测试视频",
            duration: 5,
            resolution: "720p",
            aspect_ratio: "9:16",
            images: [],
            videos: [],
            audios: [],
        }),
        (error: unknown) => error instanceof BadRequestException && /已停用/.test(error.message),
    );
    assert.equal(upstreamChecks, 0);
    assert.equal(reservationAttempts, 0);
});

test("官方生图结果改写为登录账户可访问的同源资产地址", () => {
    const result = rewriteGeneratedImageUrls(
        { created: 1, data: [{ url: "https://metajing.cn/video-media/images/example.png", revised_prompt: "ok" }] },
        [{ publicId: "AST123", ordinal: 0 }],
    ) as { data: Array<{ url: string; revised_prompt: string }> };

    assert.deepEqual(result.data, [{ url: "/platform-api/providers/assets/AST123/content", revised_prompt: "ok" }]);
});

test("已持久化的生成图优先从工作区媒体读取", async () => {
    let upstreamReads = 0;
    const prisma = {
        asset: { findFirst: async () => ({ data: { dataUrl: "https://metajing.cn/generated.png", storageKey: "image:AST123" } }) },
    } as unknown as PrismaService;
    const upstream = {
        imageMediaStream: async () => {
            upstreamReads += 1;
            throw new Error("不应回源供应商");
        },
    } as unknown as ProviderUpstreamService;
    const canvasMedia = {
        open: async () => ({ path: __filename, media: { mimeType: "image/png", bytes: 123n } }),
    };
    const service = new GenerationService(prisma, {} as LedgerService, {} as PricingService, upstream, workspaces, canvasMedia as never);

    const media = await service.imageAssetStream("user-1", "team-a", "AST123");
    media.body.destroy();

    assert.equal(media.contentType, "image/png");
    assert.equal(media.contentLength, 123);
    assert.equal(upstreamReads, 0);
});

test("视频通道缺失时提示已退款和可用替代模型", () => {
    const error = publicVideoGenerationError(
        new BadGatewayException('{"error":{"message":"No available channel for model qy-seedance-2.0 under group default"}}'),
        { model: "qy-seedance-2.0", videos: [], audios: [] },
    );

    assert.ok(error instanceof ServiceUnavailableException);
    assert.match(error.message, /Seedance 2\.0/);
    assert.match(error.message, /未扣费，预授权已自动退回/);
    assert.match(error.message, /另一个 Seedance 通道/);
    assert.doesNotMatch(error.message, /清衍独家/);
    assert.doesNotMatch(error.message, /Fast 720P（独家）/);
    assert.doesNotMatch(error.message, /431/);
});

test("视频创建兼容 MetaJing task_id 响应", () => {
    assert.equal(providerVideoTaskId({ task_id: "task-metajing-1" }), "task-metajing-1");
    assert.equal(providerVideoTaskId({ data: { task_id: "task-metajing-2" } }), "task-metajing-2");
    assert.equal(providerVideoTaskId({ id: "task-openai-style" }), "task-openai-style");
});

test("视频结果兼容 MetaJing succeeded 的 data 数组", () => {
    assert.equal(videoResultUrl({ status: "succeeded", data: [{ url: "https://metajing.cn/video-media/result.mp4", mp4_url: "https://metajing.cn/video-media/result.mp4" }] }), "https://metajing.cn/video-media/result.mp4");
    assert.equal(videoResultUrl({ status: "succeeded", data: { mp4_url: "https://metajing.cn/video-media/data-object.mp4" } }), "https://metajing.cn/video-media/data-object.mp4");
    assert.equal(videoResultUrl({ state: "success", result_url: "https://cdn.example.com/result.mp4" }), "https://cdn.example.com/result.mp4");
});
