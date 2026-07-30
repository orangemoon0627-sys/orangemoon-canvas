import assert from "node:assert/strict";
import test from "node:test";

import { estimateProviderCost, findProviderModel, PROVIDER_MODELS, PUBLIC_PROVIDER_MODELS } from "./provider-catalog.js";

test("provider catalog exposes the complete Orange Moon base model set", () => {
    assert.equal(PROVIDER_MODELS.filter((model) => model.capability === "image").length, 1);
    assert.equal(PROVIDER_MODELS.filter((model) => model.capability === "video").length, 31);
    assert.equal(PROVIDER_MODELS.filter((model) => model.capability === "audio").length, 2);
    assert.equal(new Set(PROVIDER_MODELS.map((model) => model.id)).size, PROVIDER_MODELS.length);
    assert.equal(PUBLIC_PROVIDER_MODELS.filter((model) => model.capability === "video").length, 10);
    assert.equal(PUBLIC_PROVIDER_MODELS.length, 13);
    assert.ok(PUBLIC_PROVIDER_MODELS.every((model) => !/(清衍|独家|\bCC\b|\bMG\b)/i.test(model.label)));
    assert.ok(PUBLIC_PROVIDER_MODELS.filter((model) => model.capability === "video").every((model) => /^seedance-2\.0-/.test(model.id)));
    assert.ok(PROVIDER_MODELS.filter((model) => model.visibility === "legacy").every((model) => findProviderModel(model.id) === model));
});

test("provider cost conversion keeps MetaJing quota and MiniMax USD rates separate", () => {
    process.env.PLATFORM_METAJING_USD_TO_CNY = "1";
    process.env.PLATFORM_MINIMAX_USD_TO_CNY = "7.3";
    const image = findProviderModel("gpt-image-2");
    const video = findProviderModel("seedance-2.0-720p-economy");
    const speech = findProviderModel("speech-2.8-hd");
    assert.ok(image && video && speech);
    assert.deepEqual(estimateProviderCost(image, 1), { upstreamUsd: 0.06, upstreamCny: 0.06, suggestedCredits: 0.099 });
    assert.deepEqual(estimateProviderCost(video, 15), { upstreamUsd: 1.5, upstreamCny: 1.5, suggestedCredits: 2.475 });
    assert.deepEqual(estimateProviderCost(speech, 1000), { upstreamUsd: 0.1, upstreamCny: 0.73, suggestedCredits: 1.205 });
});

test("Seedance reference limits remain model-specific", () => {
    const exclusive = findProviderModel("seedance-2.0-720p-economy");
    const cc = findProviderModel("cc-seedance2.0 480p-fast-nsp");
    const pro = findProviderModel("seedance-2.0-720p-pro");
    const fixed = findProviderModel("mg-seedance2.0 -720p-mini-gz-15s");
    assert.deepEqual(exclusive?.references && { images: exclusive.references.images, videos: exclusive.references.videos, audios: exclusive.references.audios }, { images: 9, videos: 0, audios: 0 });
    assert.deepEqual(cc?.references && { images: cc.references.images, videos: cc.references.videos, audios: cc.references.audios }, { images: 9, videos: 0, audios: 3 });
    assert.deepEqual(pro?.references && { images: pro.references.images, videos: pro.references.videos, audios: pro.references.audios }, { images: 4, videos: 3, audios: 1 });
    assert.equal(fixed?.fixedDuration, 15);
    const qy = findProviderModel("seedance-2.0-1080p-standard");
    assert.equal(qy?.upstreamModel, "qy-seedance-2.0");
    assert.deepEqual(qy?.allowedDurations, [5, 10, 15]);
});
