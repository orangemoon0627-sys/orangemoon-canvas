import assert from "node:assert/strict";
import test from "node:test";

import { BadGatewayException, BadRequestException } from "@nestjs/common";

import { ProviderUpstreamService, videoUpstreamRequest } from "./provider-upstream.service";

const baseInput = {
    prompt: "夜航快递，竖屏电影镜头",
    duration: 15,
    aspect_ratio: "9:16",
    images: ["data:image/png;base64,reference"],
    videos: [],
    audios: [],
};

test("独家视频请求原样携带真实模型和选择的分辨率", () => {
    const request = videoUpstreamRequest({ ...baseInput, model: "qy-seedance-2.0", resolution: "1080p" }, "test-key");

    assert.equal(request.payload.model, "qy-seedance-2.0");
    assert.equal(request.payload.resolution, "1080p");
    assert.equal(request.headers.Authorization, "Bearer test-key");
});

test("未指定分辨率时使用独家模型的默认分辨率", () => {
    const request = videoUpstreamRequest({ ...baseInput, model: "qy-seedance-2.0" }, "test-key");

    assert.equal(request.payload.model, "qy-seedance-2.0");
    assert.equal(request.payload.resolution, "720p");
});

test("431 请求保留真实模型 ID", () => {
    const request = videoUpstreamRequest({ ...baseInput, model: "431-Seedream-2.0-fast", duration: 14, resolution: "480p" }, "test-key");
    assert.equal(request.payload.model, "431-Seedream-2.0-fast");
    assert.equal(request.payload.resolution, "480p");
});

test("Seedance 2.5 请求保留真实模型和首尾帧字段", () => {
    const request = videoUpstreamRequest({ ...baseInput, model: "qy-seedance-2.5", duration: 29, resolution: "720p", start_frame_url: "https://example.com/start.png", end_frame_url: "https://example.com/end.png" }, "test-key");
    assert.equal(request.payload.model, "qy-seedance-2.5");
    assert.equal(request.payload.duration, 29);
    assert.equal(request.payload.start_frame_url, "https://example.com/start.png");
    assert.equal(request.payload.end_frame_url, "https://example.com/end.png");
});

test("其他旧视频模型不能进入上游", () => {
    for (const model of ["mg-seedance2.0 -720p fast", "Seedance 2.0-fast-720p"]) {
        assert.throws(
            () => videoUpstreamRequest({ ...baseInput, model, resolution: "720p" }, "test-key"),
            (error: unknown) => error instanceof BadRequestException && /已停用/.test(error.message),
        );
    }
});

test("生成图片代理以流方式转发并保留媒体元数据", async (context) => {
    const previousKey = process.env.METAJING_API_KEY;
    const previousBase = process.env.METAJING_API_BASE;
    const previousFetch = globalThis.fetch;
    process.env.METAJING_API_KEY = "test-key";
    process.env.METAJING_API_BASE = "https://metajing.example";
    globalThis.fetch = async () => new Response(Uint8Array.from([1, 2, 3, 4]), { headers: { "content-type": "image/png", "content-length": "4" } });
    context.after(() => {
        if (previousKey === undefined) delete process.env.METAJING_API_KEY;
        else process.env.METAJING_API_KEY = previousKey;
        if (previousBase === undefined) delete process.env.METAJING_API_BASE;
        else process.env.METAJING_API_BASE = previousBase;
        globalThis.fetch = previousFetch;
    });

    const media = await new ProviderUpstreamService().imageMediaStream("https://cdn.metajing.example/generated.png");
    const chunks: Buffer[] = [];
    for await (const chunk of media.body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));

    assert.equal(media.contentType, "image/png");
    assert.equal(media.contentLength, 4);
    assert.deepEqual(Buffer.concat(chunks), Buffer.from([1, 2, 3, 4]));
});

test("生成图片代理拒绝非供应商域名", async (context) => {
    const previousKey = process.env.METAJING_API_KEY;
    const previousBase = process.env.METAJING_API_BASE;
    process.env.METAJING_API_KEY = "test-key";
    process.env.METAJING_API_BASE = "https://metajing.example";
    context.after(() => {
        if (previousKey === undefined) delete process.env.METAJING_API_KEY;
        else process.env.METAJING_API_KEY = previousKey;
        if (previousBase === undefined) delete process.env.METAJING_API_BASE;
        else process.env.METAJING_API_BASE = previousBase;
    });

    await assert.rejects(() => new ProviderUpstreamService().imageMediaStream("https://example.org/generated.png"), BadGatewayException);
});
