import assert from "node:assert/strict";
import test from "node:test";

import { buildSeedanceDirectorPrompt, createDefaultDirectorScene, sceneAtTime, upsertTransformKeyframes } from "./director-scene";

test("导演台在关键帧之间线性插值对象与相机", () => {
    const scene = createDefaultDirectorScene();
    const evaluated = sceneAtTime(scene, 4);
    assert.deepEqual(evaluated.objects.find((item) => item.id === "character-hero")?.position, [-0.875, 1, 0.2]);
    assert.equal(evaluated.camera.id, "camera-wide");
});

test("同一帧重复记录会覆盖同属性关键帧", () => {
    const scene = createDefaultDirectorScene();
    const first = upsertTransformKeyframes(scene, "object", "character-rival", 2);
    const second = upsertTransformKeyframes(first, "object", "character-rival", 2);
    assert.equal(second.keyframes.filter((key) => key.targetId === "character-rival" && key.time === 2).length, 3);
});

test("Seedance 提示词包含镜头时段、机位和连续性", () => {
    const prompt = buildSeedanceDirectorPrompt(createDefaultDirectorScene());
    assert.match(prompt, /镜头1 \[0s-5s\]/);
    assert.match(prompt, /缓慢推近/);
    assert.match(prompt, /不跳轴/);
});
