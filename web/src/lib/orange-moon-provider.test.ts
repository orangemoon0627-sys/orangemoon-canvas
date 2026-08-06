import assert from "node:assert/strict";
import test from "node:test";

import { canonicalOrangeMoonVideoModel, getOrangeMoonModelPublicName, getOrangeMoonVideoModel, ORANGE_MOON_VIDEO_MODEL_IDS, ORANGE_MOON_VIDEO_MODELS, removeOrangeMoonInternalModelPrefix } from "./orange-moon-provider";
import { normalizeSeedanceDurationForModel } from "./seedance-video";

test("only exposes the two exclusive video APIs and resolves their supported resolutions", () => {
    assert.deepEqual(ORANGE_MOON_VIDEO_MODELS.map((model) => model.name), [...ORANGE_MOON_VIDEO_MODEL_IDS]);
    assert.equal(getOrangeMoonVideoModel("qy-seedance-2.0", "1080")?.resolution, "1080p");
    assert.equal(getOrangeMoonVideoModel("qy-seedance-2.0", "1080")?.price.usd, 0.6);
    assert.equal(getOrangeMoonVideoModel("qy-seedance-2.0-fast", "480p")?.resolution, "480p");
    assert.equal(getOrangeMoonVideoModel("qy-seedance-2.0-fast", "480p")?.price.usd, 1 / 6);
    assert.equal(normalizeSeedanceDurationForModel("qy-seedance-2.0", "8"), 10);
    assert.equal((ORANGE_MOON_VIDEO_MODEL_IDS as readonly string[]).includes("431-Seedream-2.0"), false);
});

test("legacy browser selections migrate one-way to an allowed API", () => {
    const legacy = "mg-seedance2.0 -720p-gz-15s";
    assert.equal(canonicalOrangeMoonVideoModel(legacy), "qy-seedance-2.0");
    assert.equal(getOrangeMoonVideoModel(legacy)?.name, "qy-seedance-2.0");
    assert.equal(canonicalOrangeMoonVideoModel("Seedance 2.0-fast-720p"), "qy-seedance-2.0-fast");
    assert.equal(getOrangeMoonVideoModel("Seedance 2.0-fast-720p", "1080p")?.resolution, "720p");
    assert.equal(canonicalOrangeMoonVideoModel("431-Seedream-2.0"), "qy-seedance-2.0");
    assert.equal(getOrangeMoonVideoModel("431-Seedream-2.0")?.name, "qy-seedance-2.0");
    assert.equal(normalizeSeedanceDurationForModel("431-Seedream-2.0", "8"), 10);
});

test("public model names hide the internal qy prefix while preserving the real model ids", () => {
    assert.equal(getOrangeMoonModelPublicName("qy-seedance-2.0-fast"), "seedance-2.0-fast");
    assert.equal(getOrangeMoonModelPublicName("qy-seedance-2.0"), "seedance-2.0");
    assert.equal(removeOrangeMoonInternalModelPrefix("当前使用 qy-seedance-2.0-fast"), "当前使用 seedance-2.0-fast");
});
