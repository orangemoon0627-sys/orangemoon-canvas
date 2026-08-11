import assert from "node:assert/strict";
import test from "node:test";

import { BadRequestException } from "@nestjs/common";

import { videoUpstreamRequest } from "./provider-upstream.service";

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

test("其他旧视频模型不能进入上游", () => {
    for (const model of ["mg-seedance2.0 -720p fast", "Seedance 2.0-fast-720p"]) {
        assert.throws(
            () => videoUpstreamRequest({ ...baseInput, model, resolution: "720p" }, "test-key"),
            (error: unknown) => error instanceof BadRequestException && /已停用/.test(error.message),
        );
    }
});
