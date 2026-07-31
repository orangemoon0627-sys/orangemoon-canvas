import assert from "node:assert/strict";
import test from "node:test";

import { canonicalOrangeMoonVideoModel, getOrangeMoonVideoModel, ORANGE_MOON_VIDEO_MODELS } from "./orange-moon-provider";

test("only exposes three Seedance products and resolves resolution at submission time", () => {
    assert.deepEqual(ORANGE_MOON_VIDEO_MODELS.map((model) => model.name), ["seedance-2.0", "seedance-2.0-fast", "seedance-2.0-mini"]);
    assert.equal(getOrangeMoonVideoModel("seedance-2.0", "720")?.name, "seedance-2.0-720p-pro");
    assert.equal(getOrangeMoonVideoModel("seedance-2.0-fast", "480p")?.name, "seedance-2.0-480p-fast");
    assert.equal(getOrangeMoonVideoModel("seedance-2.0-mini", "1080p")?.name, "seedance-2.0-720p-mini");
});

test("legacy provider names migrate to a product while retaining embedded resolution", () => {
    const legacy = "mg-seedance2.0 -720p-gz-15s";
    assert.equal(canonicalOrangeMoonVideoModel(legacy), "seedance-2.0");
    assert.equal(getOrangeMoonVideoModel(legacy)?.name, "seedance-2.0-720p-pro");
});
