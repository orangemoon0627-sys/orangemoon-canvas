import assert from "node:assert/strict";
import test from "node:test";

import {
    EXCLUSIVE_VIDEO_MODEL_IDS,
    findProviderModel,
    providerBilling,
    PROVIDER_MODELS,
    PUBLIC_PROVIDER_MODELS,
    resolveProviderVideoResolution,
} from "./provider-catalog";

test("公开目录严格只保留五个独家视频 API", () => {
    const publicVideos = PUBLIC_PROVIDER_MODELS.filter((model) => model.capability === "video");

    assert.equal(PROVIDER_MODELS.filter((model) => model.capability === "video").length, 5);
    assert.deepEqual(publicVideos.map((model) => model.id), [...EXCLUSIVE_VIDEO_MODEL_IDS]);
    assert.ok(publicVideos.every((model) => model.exclusive && model.visibility === "public"));
    assert.equal(findProviderModel("mg-seedance2.0 -720p fast"), undefined);
    assert.equal(findProviderModel("431-Seedream-2.0")?.visibility, "public");
    assert.equal(findProviderModel("431-Seedream-2.0-fast")?.visibility, "public");
    assert.equal(findProviderModel("Seedance 2.0-fast-720p"), undefined);
});

test("独家视频 API 按各自支持的分辨率选择真实费率", () => {
    const fast431 = findProviderModel("431-Seedream-2.0-fast")!;
    const standard431 = findProviderModel("431-Seedream-2.0")!;
    const qyFast = findProviderModel("qy-seedance-2.0-fast")!;
    const qy = findProviderModel("qy-seedance-2.0")!;
    const qy25 = findProviderModel("qy-seedance-2.5")!;

    assert.deepEqual(qyFast.resolutions, ["480p", "720p"]);
    assert.equal(providerBilling(qyFast, "480p")?.usd, 1 / 6);
    assert.equal(providerBilling(qy, "720p")?.usd, 4 / 15);
    assert.equal(providerBilling(qy, "1080p")?.usd, 0.6);
    assert.equal(resolveProviderVideoResolution(qyFast), "720p");
    assert.equal(resolveProviderVideoResolution(qyFast, "1080p"), undefined);
    assert.deepEqual(fast431.allowedDurations, [5, 10, 14]);
    assert.equal(providerBilling(fast431, "720p")?.usd, 0.189);
    assert.equal(providerBilling(standard431, "480p")?.usd, 0.148);
    assert.equal(resolveProviderVideoResolution(standard431, "1080p"), undefined);
    assert.deepEqual(qy25.resolutions, ["480p", "720p"]);
    assert.equal(providerBilling(qy25, "480p")?.usd, 0.19);
    assert.equal(providerBilling(qy25, "720p")?.usd, 0.24);
    assert.equal(qy25.videoReferenceMultiplier, 1.6);
    assert.deepEqual(qy25.references && { images: qy25.references.images, videos: qy25.references.videos, audios: qy25.references.audios }, { images: 30, videos: 10, audios: 10 });
    assert.equal(qy25.references?.audioMaxItemSeconds, 15);
});
