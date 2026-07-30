import assert from "node:assert/strict";
import test from "node:test";

import { BadGatewayException, ServiceUnavailableException } from "@nestjs/common";

import type { PrismaService } from "../prisma/prisma.service";
import type { LedgerService } from "../wallet/ledger.service";
import { GenerationService, publicVideoGenerationError, rewriteGeneratedImageUrls } from "./generation.service";
import type { PricingService } from "./pricing.service";
import type { ProviderUpstreamService } from "./provider-upstream.service";

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
    const service = new GenerationService({} as PrismaService, ledger, {} as PricingService, upstream);

    await assert.rejects(
        service.image("user-1", "image-preflight-1", {
            model: "gpt-image-2",
            prompt: "测试图片",
            size: "1024x1024",
            n: 1,
            response_format: "url",
            output_format: "png",
        }),
        (error: unknown) => error instanceof ServiceUnavailableException && error.message === "MetaJing 密钥尚未在服务端配置",
    );
    assert.equal(reservationAttempts, 0);
});

test("官方生图结果改写为登录账户可访问的同源资产地址", () => {
    const result = rewriteGeneratedImageUrls(
        { created: 1, data: [{ url: "https://metajing.cn/video-media/images/example.png", revised_prompt: "ok" }] },
        [{ publicId: "AST123", ordinal: 0 }],
    ) as { data: Array<{ url: string; revised_prompt: string }> };

    assert.deepEqual(result.data, [{ url: "/platform-api/providers/assets/AST123/content", revised_prompt: "ok" }]);
});

test("视频通道缺失时提示已退款和可用替代模型", () => {
    const error = publicVideoGenerationError(
        new BadGatewayException('{"error":{"message":"No available channel for model mg-seedance2.0 -720p-gz-15s under group default"}}'),
        { model: "mg-seedance2.0 -720p-gz-15s", videos: [], audios: [] },
    );

    assert.ok(error instanceof ServiceUnavailableException);
    assert.match(error.message, /Seedance 2\.0 720P 标准（15 秒旧配置）/);
    assert.match(error.message, /未扣费，预授权已自动退回/);
    assert.match(error.message, /Seedance 2\.0 720P 经济/);
});
