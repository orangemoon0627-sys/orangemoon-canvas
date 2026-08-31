import assert from "node:assert/strict";
import test from "node:test";

import { estimateProviderCost, EXCLUSIVE_VIDEO_MODEL_IDS, findProviderModel, PROVIDER_MODELS, PUBLIC_PROVIDER_MODELS } from "./provider-catalog.js";

test("provider catalog exposes only the five exclusive video APIs", () => {
    assert.equal(PROVIDER_MODELS.filter((model) => model.capability === "image").length, 1);
    assert.equal(PROVIDER_MODELS.filter((model) => model.capability === "video").length, 5);
    assert.equal(PROVIDER_MODELS.filter((model) => model.capability === "audio").length, 2);
    assert.equal(new Set(PROVIDER_MODELS.map((model) => model.id)).size, PROVIDER_MODELS.length);
    assert.equal(PUBLIC_PROVIDER_MODELS.length, 8);
    assert.deepEqual(PUBLIC_PROVIDER_MODELS.filter((model) => model.capability === "video").map((model) => model.id), [...EXCLUSIVE_VIDEO_MODEL_IDS]);
    assert.ok(PUBLIC_PROVIDER_MODELS.filter((model) => model.capability === "video").every((model) => model.exclusive));
    assert.equal(findProviderModel("431-Seedream-2.0")?.visibility, "public");
    assert.equal(findProviderModel("mg-seedance2.0 -720p fast"), undefined);
    assert.equal(findProviderModel("Seedance 2.0-fast-720p"), undefined);
    assert.equal(findProviderModel("qy-seedance-2.5")?.visibility, "public");
});

test("provider cost conversion keeps MetaJing quota and MiniMax USD rates separate", () => {
    process.env.PLATFORM_METAJING_USD_TO_CNY = "1";
    process.env.PLATFORM_MINIMAX_USD_TO_CNY = "7.3";
    const image = findProviderModel("gpt-image-2");
    const video = findProviderModel("qy-seedance-2.0-fast");
    const speech = findProviderModel("speech-2.8-hd");
    assert.ok(image && video && speech);
    assert.deepEqual(estimateProviderCost(image, 1), { upstreamUsd: 0.06, upstreamCny: 0.06, suggestedCredits: 0.099, resolution: undefined });
    assert.deepEqual(estimateProviderCost(video, 15, "720p"), { upstreamUsd: 3, upstreamCny: 3, suggestedCredits: 4.95, resolution: "720p" });
    assert.deepEqual(estimateProviderCost(speech, 1000), { upstreamUsd: 0.1, upstreamCny: 0.73, suggestedCredits: 1.205, resolution: undefined });
});

test("the five Seedance APIs expose their official reference limits", () => {
    const standard431 = findProviderModel("431-Seedream-2.0");
    const fast431 = findProviderModel("431-Seedream-2.0-fast");
    const qy = findProviderModel("qy-seedance-2.0");
    const qyFast = findProviderModel("qy-seedance-2.0-fast");
    const qy25 = findProviderModel("qy-seedance-2.5");
    assert.deepEqual(qy?.references && { images: qy.references.images, videos: qy.references.videos, audios: qy.references.audios }, { images: 9, videos: 3, audios: 3 });
    assert.deepEqual(qyFast?.references && { images: qyFast.references.images, videos: qyFast.references.videos, audios: qyFast.references.audios }, { images: 9, videos: 3, audios: 3 });
    assert.deepEqual(standard431?.references && { images: standard431.references.images, videos: standard431.references.videos, audios: standard431.references.audios }, { images: 4, videos: 3, audios: 1 });
    assert.deepEqual(fast431?.allowedDurations, [5, 10, 14]);
    assert.deepEqual(qy?.allowedDurations, [5, 10, 15]);
    assert.deepEqual(qyFast?.allowedDurations, [5, 10, 15]);
    assert.deepEqual(qy?.resolutions, ["480p", "720p", "1080p"]);
    assert.deepEqual(qy25?.references && { images: qy25.references.images, videos: qy25.references.videos, audios: qy25.references.audios }, { images: 30, videos: 10, audios: 10 });
    assert.equal(qy25?.references?.audioMaxItemSeconds, 15);
    assert.equal(qy25?.videoReferenceMultiplier, 1.6);
    assert.deepEqual(estimateProviderCost(qy25!, 15, "720p", { hasVideoReferences: true }), { upstreamUsd: 5.76, upstreamCny: 5.76, suggestedCredits: 9.504, resolution: "720p" });
});
