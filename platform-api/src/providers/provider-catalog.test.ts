import assert from "node:assert/strict";
import test from "node:test";

import { findProviderModel, PROVIDER_MODELS, PUBLIC_PROVIDER_MODELS } from "./provider-catalog";

test("公开目录只展示合并后的产品档位，旧型号仍可执行", () => {
    const publicVideos = PUBLIC_PROVIDER_MODELS.filter((model) => model.capability === "video");

    assert.equal(PROVIDER_MODELS.filter((model) => model.capability === "video").length, 31);
    assert.equal(publicVideos.length, 7);
    assert.deepEqual(publicVideos.map((model) => `${model.resolution}:${model.tier}`), [
        "480p:mini",
        "480p:fast",
        "480p:pro",
        "720p:mini",
        "720p:fast",
        "720p:pro",
        "1080p:pro",
    ]);
    assert.deepEqual(new Set(publicVideos.map((model) => model.product)), new Set(["seedance-2.0", "seedance-2.0-fast", "seedance-2.0-mini"]));
    assert.ok(publicVideos.every((model) => !/(清衍|独家|\bCC\b|\bMG\b)/i.test(model.label)));
    assert.ok(publicVideos.every((model) => /^seedance-2\.0-/.test(model.id)));
    assert.equal(findProviderModel("mg-seedance2.0 -720p-gz-15s")?.visibility, "legacy");
});
