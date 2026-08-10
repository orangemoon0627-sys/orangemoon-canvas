import assert from "node:assert/strict";
import test from "node:test";

import { buildSeedanceDirectorPrompt, mergeDirectorScene, normalizeDirectorScene } from "./director-scene.js";

test("导演台场景会过滤悬空镜头和关键帧引用", () => {
    const scene = normalizeDirectorScene({
        name: "斗法",
        cameras: [{ id: "camera-1", name: "主机位", position: [5, 3, 8], target: [0, 1, 0], fov: 40 }],
        shots: [
            { id: "shot-1", name: "有效镜头", cameraId: "camera-1", start: 0, end: 4, movement: "push-in" },
            { id: "shot-2", name: "悬空镜头", cameraId: "missing", start: 4, end: 8, movement: "static" },
        ],
        keyframes: [{ id: "key-1", targetType: "camera", targetId: "missing", property: "position", time: 2, value: [1, 2, 3] }],
    });
    assert.deepEqual(scene.shots.map((shot) => shot.id), ["shot-1"]);
    assert.equal(scene.keyframes.length, 0);
});

test("导演台局部更新会保留未提供的对象和机位", () => {
    const original = normalizeDirectorScene({ name: "第一版" });
    const updated = mergeDirectorScene(original, { name: "第二版", duration: 15 });
    assert.equal(updated.name, "第二版");
    assert.equal(updated.duration, 15);
    assert.deepEqual(updated.objects, original.objects);
    assert.deepEqual(updated.cameras, original.cameras);
});

test("导演台可编译为带时间线和连续性要求的 Seedance 提示词", () => {
    const prompt = buildSeedanceDirectorPrompt({
        name: "追逐",
        cameras: [{ id: "camera-1", name: "低机位", position: [3, 1, 7], target: [0, 1, 0], fov: 35 }],
        shots: [{ id: "shot-1", name: "逼近", cameraId: "camera-1", start: 0, end: 5, movement: "push-in", description: "压迫感增强" }],
    });
    assert.match(prompt, /镜头1 \[0s-5s\] 逼近/);
    assert.match(prompt, /FOV 35°/);
    assert.match(prompt, /不跳轴/);
});
