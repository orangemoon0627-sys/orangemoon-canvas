import assert from "node:assert/strict";
import test from "node:test";

import { canonicalOrangeMoonVideoModel, getOrangeMoonVideoModel, ORANGE_MOON_VIDEO_MODEL_IDS, ORANGE_MOON_VIDEO_MODELS } from "./orange-moon-provider";
import { normalizeSeedanceDurationForModel } from "./seedance-video";

test("only exposes the three exclusive video APIs and resolves their supported resolutions", () => {
    assert.deepEqual(ORANGE_MOON_VIDEO_MODELS.map((model) => model.name), [...ORANGE_MOON_VIDEO_MODEL_IDS]);
    assert.equal(getOrangeMoonVideoModel("qy-seedance-2.0", "1080")?.resolution, "1080p");
    assert.equal(getOrangeMoonVideoModel("qy-seedance-2.0", "1080")?.price.usd, 0.6);
    assert.equal(getOrangeMoonVideoModel("qy-seedance-2.0-fast", "480p")?.resolution, "480p");
    assert.equal(getOrangeMoonVideoModel("qy-seedance-2.0-fast", "480p")?.price.usd, 1 / 6);
    assert.equal(getOrangeMoonVideoModel("431-Seedream-2.0", "720p")?.resolution, "720p");
    assert.equal(normalizeSeedanceDurationForModel("431-Seedream-2.0", "8"), 8);
    assert.equal(normalizeSeedanceDurationForModel("qy-seedance-2.0", "8"), 10);
});

test("legacy browser selections migrate one-way to an allowed API", () => {
    const legacy = "mg-seedance2.0 -720p-gz-15s";
    assert.equal(canonicalOrangeMoonVideoModel(legacy), "qy-seedance-2.0");
    assert.equal(getOrangeMoonVideoModel(legacy)?.name, "qy-seedance-2.0");
    assert.equal(canonicalOrangeMoonVideoModel("Seedance 2.0-fast-720p"), "qy-seedance-2.0-fast");
    assert.equal(getOrangeMoonVideoModel("Seedance 2.0-fast-720p", "1080p")?.resolution, "720p");
});
