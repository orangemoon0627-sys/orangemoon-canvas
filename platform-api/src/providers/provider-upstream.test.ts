import assert from "node:assert/strict";
import test from "node:test";

import { videoUpstreamRequest } from "./provider-upstream.service";

const baseInput = {
    prompt: "夜航快递，竖屏电影镜头",
    duration: 15,
    aspect_ratio: "9:16",
    images: ["data:image/png;base64,reference"],
    videos: [],
    audios: [],
};

test("MG 视频按 MetaJing newapi 网页协议携带来源和分辨率", () => {
    const request = videoUpstreamRequest({ ...baseInput, model: "seedance-2.0-720p-pro" }, "test-key");

    assert.equal(request.headers["x-aihub-source"], "web");
    assert.equal(request.payload.model, "mg-seedance2.0 -720p pro");
    assert.equal(request.payload.resolution, "720p");
});

test("清衍别名转换为上游模型并保留选择的分辨率", () => {
    const request = videoUpstreamRequest({ ...baseInput, model: "seedance-2.0-720p-standard" }, "test-key");

    assert.equal(request.headers["x-aihub-source"], undefined);
    assert.equal(request.payload.model, "qy-seedance-2.0");
    assert.equal(request.payload.resolution, "720p");
});
