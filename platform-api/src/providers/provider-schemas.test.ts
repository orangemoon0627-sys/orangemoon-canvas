import assert from "node:assert/strict";
import test from "node:test";

import { videoRequestSchema } from "./provider-schemas";

const baseInput = {
    prompt: "神话斗法，电影级镜头",
    duration: 5,
    resolution: "720p",
    aspect_ratio: "9:16",
    images: [],
    videos: [],
    audios: [],
};

test("四个独家视频 API 都能通过请求校验", () => {
    const requests = [
        { ...baseInput, model: "qy-seedance-2.0-fast" },
        { ...baseInput, model: "qy-seedance-2.0", resolution: "1080p" },
        { ...baseInput, model: "431-Seedream-2.0", duration: 4, resolution: "480p" },
        { ...baseInput, model: "Seedance 2.0-fast-720p" },
    ];

    assert.ok(requests.every((request) => videoRequestSchema.safeParse(request).success));
});

test("旧视频模型会在请求入口被拒绝", () => {
    const result = videoRequestSchema.safeParse({ ...baseInput, model: "mg-seedance2.0 -720p fast" });

    assert.equal(result.success, false);
    if (!result.success) assert.match(result.error.issues.map((issue) => issue.message).join("；"), /只允许四个独家视频 API/);
});

test("分辨率和时长按独家模型能力分别校验", () => {
    assert.equal(videoRequestSchema.safeParse({ ...baseInput, model: "Seedance 2.0-fast-720p", resolution: "1080p" }).success, false);
    assert.equal(videoRequestSchema.safeParse({ ...baseInput, model: "qy-seedance-2.0", duration: 6 }).success, false);
    assert.equal(videoRequestSchema.safeParse({ ...baseInput, model: "431-Seedream-2.0", duration: 4 }).success, true);
    assert.equal(videoRequestSchema.safeParse({ ...baseInput, model: "431-Seedream-2.0", duration: 15 }).success, true);
    assert.equal(videoRequestSchema.safeParse({ ...baseInput, model: "431-Seedream-2.0", duration: 16 }).success, false);
});

test("低成本独家 720P 通道拒绝视频和音频参考", () => {
    const result = videoRequestSchema.safeParse({
        ...baseInput,
        model: "Seedance 2.0-fast-720p",
        videos: ["https://cdn.example.com/reference.mp4"],
        audios: ["https://cdn.example.com/reference.mp3"],
    });

    assert.equal(result.success, false);
    if (!result.success) {
        const message = result.error.issues.map((issue) => issue.message).join("；");
        assert.match(message, /不支持参考视频/);
        assert.match(message, /不支持参考音频/);
    }
});
