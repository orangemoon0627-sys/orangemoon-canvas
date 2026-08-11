import assert from "node:assert/strict";
import test from "node:test";

import { imageRequestSchema, videoRequestSchema } from "./provider-schemas";

const baseInput = {
    prompt: "神话斗法，电影级镜头",
    duration: 5,
    resolution: "720p",
    aspect_ratio: "9:16",
    images: [],
    videos: [],
    audios: [],
};

test("四个 Seedance 视频 API 都能通过请求校验", () => {
    const requests = [
        { ...baseInput, model: "431-Seedream-2.0-fast", duration: 14 },
        { ...baseInput, model: "431-Seedream-2.0", duration: 10 },
        { ...baseInput, model: "qy-seedance-2.0-fast" },
        { ...baseInput, model: "qy-seedance-2.0", resolution: "1080p" },
    ];

    assert.ok(requests.every((request) => videoRequestSchema.safeParse(request).success));
});

test("旧视频模型会在请求入口被拒绝", () => {
    for (const model of ["mg-seedance2.0 -720p fast", "Seedance 2.0-fast-720p"]) {
        const result = videoRequestSchema.safeParse({ ...baseInput, model });
        assert.equal(result.success, false);
        if (!result.success) assert.match(result.error.issues.map((issue) => issue.message).join("；"), /四个 Seedance 2\.0/);
    }
});

test("分辨率和时长按模型能力分别校验", () => {
    assert.equal(videoRequestSchema.safeParse({ ...baseInput, model: "qy-seedance-2.0-fast", resolution: "1080p" }).success, false);
    assert.equal(videoRequestSchema.safeParse({ ...baseInput, model: "qy-seedance-2.0-fast", duration: 6 }).success, false);
    assert.equal(videoRequestSchema.safeParse({ ...baseInput, model: "qy-seedance-2.0", duration: 6 }).success, false);
    assert.equal(videoRequestSchema.safeParse({ ...baseInput, model: "qy-seedance-2.0", duration: 15 }).success, true);
    assert.equal(videoRequestSchema.safeParse({ ...baseInput, model: "431-Seedream-2.0", duration: 15 }).success, false);
    assert.equal(videoRequestSchema.safeParse({ ...baseInput, model: "431-Seedream-2.0", duration: 14 }).success, true);
    assert.equal(videoRequestSchema.safeParse({ ...baseInput, model: "431-Seedream-2.0", resolution: "1080p" }).success, false);
});

test("Image 2 接受最多四张参考图并兼容旧 image 字段", () => {
    const references = [1, 2, 3, 4].map((index) => `data:image/png;base64,ref${index}`);
    const parsed = imageRequestSchema.parse({ model: "gpt-image-2", prompt: "融合人物与场景", images: references });
    assert.deepEqual(parsed.images, references);
    assert.equal(parsed.image, undefined);
    assert.deepEqual(imageRequestSchema.parse({ model: "gpt-image-2", prompt: "旧请求", image: references[0] }).images, [references[0]]);
    assert.equal(imageRequestSchema.safeParse({ model: "gpt-image-2", prompt: "过多参考", images: [...references, references[0]] }).success, false);
});
