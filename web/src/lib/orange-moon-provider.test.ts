import assert from "node:assert/strict";
import test from "node:test";

import { canonicalOrangeMoonVideoModel, getOrangeMoonModelPublicName, getOrangeMoonVideoModel, ORANGE_MOON_VIDEO_MODEL_IDS, ORANGE_MOON_VIDEO_MODELS, removeOrangeMoonInternalModelPrefix } from "./orange-moon-provider";
import { normalizeSeedanceDurationForModel, partitionSeedanceAudioReferences, partitionSeedanceReferenceImages, seedanceFrameReferenceError, seedanceReferenceSetError } from "./seedance-video";

test("only exposes the five exclusive video APIs and resolves their supported resolutions", () => {
    assert.deepEqual(ORANGE_MOON_VIDEO_MODELS.map((model) => model.name), [...ORANGE_MOON_VIDEO_MODEL_IDS]);
    assert.equal(getOrangeMoonVideoModel("qy-seedance-2.0", "1080")?.resolution, "1080p");
    assert.equal(getOrangeMoonVideoModel("qy-seedance-2.0", "1080")?.price.usd, 0.6);
    assert.equal(getOrangeMoonVideoModel("qy-seedance-2.0-fast", "480p")?.resolution, "480p");
    assert.equal(getOrangeMoonVideoModel("qy-seedance-2.0-fast", "480p")?.price.usd, 1 / 6);
    assert.equal(getOrangeMoonVideoModel("qy-seedance-2.5", "480p")?.price.usd, 0.19);
    assert.equal(getOrangeMoonVideoModel("qy-seedance-2.5", "720p")?.price.usd, 0.24);
    assert.equal(normalizeSeedanceDurationForModel("qy-seedance-2.5", "28"), 28);
    assert.equal(normalizeSeedanceDurationForModel("qy-seedance-2.5", "30"), 29);
    assert.equal(getOrangeMoonVideoModel("qy-seedance-2.5")?.references.images, 30);
    assert.equal(getOrangeMoonVideoModel("qy-seedance-2.5")?.videoReferenceMultiplier, 1.6);
    assert.equal(seedanceFrameReferenceError(getOrangeMoonVideoModel("qy-seedance-2.5")!, "firstlast", 1), "首尾帧模式需要按顺序连接 2 张图片");
    assert.deepEqual(partitionSeedanceReferenceImages(["start", "end"], "firstlast"), { images: [], startFrame: "start", endFrame: "end" });
    assert.equal(normalizeSeedanceDurationForModel("qy-seedance-2.0", "8"), 10);
    assert.equal(getOrangeMoonVideoModel("431-Seedream-2.0-fast", "720p")?.price.usd, 0.189);
    assert.equal(getOrangeMoonVideoModel("431-Seedream-2.0", "480p")?.price.usd, 0.148);
    assert.equal(getOrangeMoonVideoModel("431-Seedream-2.0")?.references.images, 4);
    assert.deepEqual(ORANGE_MOON_VIDEO_MODELS.map((model) => model.label), ["Seedance 2.0 Fast（431）", "Seedance 2.0（431）", "Seedance 2.5", "Seedance 2.0 Fast", "Seedance 2.0"]);
    assert.ok(ORANGE_MOON_VIDEO_MODELS.every((model) => !model.label.includes("清衍独家")));
});

test("legacy browser selections migrate one-way to an allowed API", () => {
    const legacy = "mg-seedance2.0 -720p-gz-15s";
    assert.equal(canonicalOrangeMoonVideoModel(legacy), "qy-seedance-2.0");
    assert.equal(getOrangeMoonVideoModel(legacy)?.name, "qy-seedance-2.0");
    assert.equal(canonicalOrangeMoonVideoModel("Seedance 2.0-fast-720p"), "qy-seedance-2.0-fast");
    assert.equal(getOrangeMoonVideoModel("Seedance 2.0-fast-720p", "1080p")?.resolution, "720p");
    assert.equal(canonicalOrangeMoonVideoModel("431-Seedream-2.0"), "431-Seedream-2.0");
    assert.equal(getOrangeMoonVideoModel("431-Seedream-2.0")?.name, "431-Seedream-2.0");
    assert.equal(normalizeSeedanceDurationForModel("431-Seedream-2.0", "8"), 10);
});

test("public model names hide the internal qy prefix while preserving the real model ids", () => {
    assert.equal(getOrangeMoonModelPublicName("qy-seedance-2.0-fast"), "seedance-2.0-fast");
    assert.equal(getOrangeMoonModelPublicName("qy-seedance-2.0"), "seedance-2.0");
    assert.equal(getOrangeMoonModelPublicName("qy-seedance-2.5"), "seedance-2.5");
    assert.equal(getOrangeMoonModelPublicName("431-Seedream-2.0"), "431-Seedream-2.0");
    assert.equal(removeOrangeMoonInternalModelPrefix("当前使用 qy-seedance-2.0-fast"), "当前使用 seedance-2.0-fast");
    assert.equal(removeOrangeMoonInternalModelPrefix("当前使用 qy-seedance-2.5"), "当前使用 seedance-2.5");
});

test("Seedance 2.5 routes long audio to the final soundtrack instead of the reference-audio field", () => {
    const model = getOrangeMoonVideoModel("qy-seedance-2.5");
    assert.equal(model?.references.audioMaxItemSeconds, 15);
    const audio = { id: "audio-1", name: "配乐.mp3", type: "audio/mpeg", url: "blob:audio", durationMs: 29_000 };
    assert.deepEqual(partitionSeedanceAudioReferences("qy-seedance-2.5", [audio]), { referenceAudios: [], soundtrack: audio, error: "" });
    assert.equal(
        seedanceReferenceSetError("qy-seedance-2.5", [], [], [{ id: "audio-1", name: "配乐.mp3", type: "audio/mpeg", url: "blob:audio", durationMs: 30_000 }]),
        "",
    );
});

test("Seedance keeps short audio references while allowing one long soundtrack", () => {
    const short = { id: "audio-short", name: "节奏.wav", type: "audio/wav", url: "blob:short", durationMs: 8_000 };
    const long = { id: "audio-long", name: "完整配乐.mp3", type: "audio/mpeg", url: "blob:long", durationMs: 29_000 };
    const plan = partitionSeedanceAudioReferences("qy-seedance-2.5", [short, long]);
    assert.deepEqual(plan.referenceAudios, [short]);
    assert.equal(plan.soundtrack, long);
    assert.equal(plan.error, "");
});

test("Seedance rejects multiple long soundtrack candidates instead of silently dropping one", () => {
    const first = { id: "audio-1", name: "第一段.mp3", type: "audio/mpeg", url: "blob:first", durationMs: 20_000 };
    const second = { id: "audio-2", name: "第二段.mp3", type: "audio/mpeg", url: "blob:second", durationMs: 20_000 };
    assert.equal(partitionSeedanceAudioReferences("qy-seedance-2.5", [first, second]).error, "当前暂只支持 1 条长音频作为成片配乐，请先合并音频");
});
