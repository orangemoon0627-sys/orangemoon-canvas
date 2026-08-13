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
        stage: { scenePosition: [2, 0, -3], sceneRotation: [0, 0.5, 0], sceneScale: 1.5 },
        cameras: [{ id: "camera-1", name: "低机位", position: [3, 1, 7], target: [0, 1, 0], fov: 35 }],
        shots: [{ id: "shot-1", name: "逼近", cameraId: "camera-1", start: 0, end: 5, movement: "push-in", description: "压迫感增强" }],
    });
    assert.match(prompt, /镜头1 \[0s-5s\] 逼近/);
    assert.match(prompt, /场景整体变换：平移\(2,0,-3\)，旋转\(0,0.5,0\)，统一缩放 1.5 倍/);
    assert.match(prompt, /FOV 35°/);
    assert.match(prompt, /不跳轴/);
});

test("旧二维场景会迁移为 v2 三维场景并保留全景设置", () => {
    const scene = normalizeDirectorScene({
        version: 1,
        compositionMode: "layers",
        stage: { panoramaRotation: 0.8, panoramaRadius: 50 },
        objects: [{ id: "hero", name: "人物", primitive: "image", assetKind: "image", role: "character", sourceNodeId: "image-hero", position: [1, -0.7, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }],
    });
    assert.equal(scene.version, 2);
    assert.equal(scene.compositionMode, "space3d");
    assert.equal(scene.objects[0]?.primitive, "character");
    assert.equal(scene.objects[0]?.characterRig?.posePreset, "stand");
    assert.deepEqual(scene.objects[0]?.position, [1, 0, 0]);
    assert.equal(scene.stage.panoramaRotation, 0.8);
    assert.equal(scene.stage.panoramaRadius, 50);
});

test("Agent 保留扩展素体、动作和场景整体变换", () => {
    const scene = normalizeDirectorScene({
        stage: { scenePosition: [2, 0, -3], sceneRotation: [0, 0.5, 0], sceneScale: 2 },
        objects: [{
            id: "hero",
            name: "主角",
            primitive: "character",
            role: "character",
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            characterRig: { bodyPreset: "broad", posePreset: "hook-punch" },
        }],
    });
    assert.equal(scene.objects[0]?.characterRig?.bodyPreset, "broad");
    assert.equal(scene.objects[0]?.characterRig?.posePreset, "hook-punch");
    assert.notDeepEqual(scene.objects[0]?.characterRig?.joints.leftUpperArm, [0, 0, 0]);
    assert.deepEqual(scene.stage.scenePosition, [2, 0, -3]);
    assert.deepEqual(scene.stage.sceneRotation, [0, 0.5, 0]);
    assert.equal(scene.stage.sceneScale, 2);
});

test("Agent 导出包含人物体型、动作与逐关节姿态", () => {
    const prompt = buildSeedanceDirectorPrompt({
        objects: [{
            id: "hero",
            name: "主角",
            primitive: "character",
            role: "character",
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            characterRig: { bodyPreset: "broad", posePreset: "hook-punch", height: 1.1, width: 1.2 },
        }],
    });
    assert.match(prompt, /勾拳姿态/);
    assert.match(prompt, /体型魁梧，身高比例1.1，体宽比例1.2/);
    assert.match(prompt, /逐关节姿态：躯干\(0.08,-0.2,0\)/);
    assert.match(prompt, /右前臂\(-1.35,-0.15,0.08\)/);
});
