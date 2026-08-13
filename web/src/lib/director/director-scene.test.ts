import assert from "node:assert/strict";
import test from "node:test";

import {
    applyDirectorPosePreset,
    buildSeedanceDirectorPrompt,
    createDefaultDirectorScene,
    createDirectorCharacterRig,
    directorAssetDisplaySize,
    isLikelyDirectorBackgroundAsset,
    isLikelyDirectorCharacterAsset,
    normalizeDirectorScene,
    placeDirectorLayer,
    replaceDefaultDirectorCharacter,
    resizeDirectorSceneAspectRatio,
    sceneAtTime,
    updateDirectorCharacterJoint,
    upsertTransformKeyframes,
} from "./director-scene";
import type { DirectorObject } from "@/types/director";

test("新导演台默认是 v2 三维空间并带可摆姿态人物", () => {
    const scene = createDefaultDirectorScene();
    const character = scene.objects[0];
    assert.equal(scene.version, 2);
    assert.equal(scene.compositionMode, "space3d");
    assert.equal(character?.primitive, "character");
    assert.equal(character?.characterRig?.posePreset, "stand");
    assert.deepEqual(character?.position, [0, 0, 0]);
    assert.deepEqual(scene.cameras[0]?.target, [0, 1.15, 0]);
});

test("旧二维导演台迁移为三维并把人物落到地面", () => {
    const scene = normalizeDirectorScene({
        version: 1,
        compositionMode: "layers",
        objects: [{ id: "legacy-hero", name: "旧人物", primitive: "character", position: [-1.5, -0.7, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#ffffff" }],
    });
    assert.equal(scene.version, 2);
    assert.equal(scene.compositionMode, "space3d");
    assert.deepEqual(scene.objects[0]?.position, [-1.5, 0, 0]);
    assert.equal(scene.objects[0]?.characterRig?.bodyPreset, "male");
});

test("姿态预设写入完整关节，手动关节改动标记为自定义", () => {
    const character = createDefaultDirectorScene().objects[0]!;
    const fighting = applyDirectorPosePreset(character, "fight");
    assert.equal(fighting.characterRig?.posePreset, "fight");
    assert.notDeepEqual(fighting.characterRig?.joints.leftUpperArm, [0, 0, 0]);
    const custom = updateDirectorCharacterJoint(fighting, "head", [0.1, 0.2, 0.3]);
    assert.equal(custom.characterRig?.posePreset, "custom");
    assert.deepEqual(custom.characterRig?.joints.head, [0.1, 0.2, 0.3]);
    assert.deepEqual(custom.characterRig?.joints.leftUpperArm, fighting.characterRig?.joints.leftUpperArm);
});

test("LibTV 风格扩展素体与动作会保留并写入关节", () => {
    const base = createDefaultDirectorScene();
    const waving = applyDirectorPosePreset(base.objects[0]!, "wave");
    const normalized = normalizeDirectorScene({
        ...base,
        objects: [{ ...waving, characterRig: { ...waving.characterRig!, bodyPreset: "chibi" } }],
        stage: { ...base.stage, scenePosition: [1, 0, -2], sceneRotation: [0, 0.4, 0], sceneScale: 1.8 },
    });
    assert.equal(normalized.objects[0]?.characterRig?.bodyPreset, "chibi");
    assert.equal(normalized.objects[0]?.characterRig?.posePreset, "wave");
    assert.notDeepEqual(normalized.objects[0]?.characterRig?.joints.rightUpperArm, [0, 0, 0]);
    assert.deepEqual(normalized.stage.scenePosition, [1, 0, -2]);
    assert.deepEqual(normalized.stage.sceneRotation, [0, 0.4, 0]);
    assert.equal(normalized.stage.sceneScale, 1.8);
});

test("人物参考图归一化后仍是 3D 素体而不是平面贴图", () => {
    const scene = normalizeDirectorScene({
        objects: [{
            id: "hero-ref",
            name: "杨戬",
            primitive: "image",
            assetKind: "image",
            sourceNodeId: "image-hero",
            role: "character",
            position: [1, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: "#4e9bff",
            characterRig: createDirectorCharacterRig("point"),
        }],
    });
    const hero = scene.objects[0]!;
    assert.equal(hero.primitive, "character");
    assert.equal(hero.assetKind, "image");
    assert.equal(hero.sourceNodeId, "image-hero");
    assert.equal(hero.characterRig?.posePreset, "point");
});

test("绑定人物参考只替换启动人物，不删除背景和道具", () => {
    const scene = createDefaultDirectorScene();
    const background: DirectorObject = { id: "background", name: "山门", primitive: "image", assetKind: "image", role: "background", position: [0, 4, -8], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#ffffff", sourceNodeId: "image-bg" };
    const prop: DirectorObject = { id: "sword", name: "兵器", primitive: "box", role: "prop", position: [0, 0.6, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#888888" };
    const withSet = { ...scene, objects: placeDirectorLayer(placeDirectorLayer(scene.objects, background), prop) };
    const hero: DirectorObject = { id: "hero-ref", name: "杨戬", primitive: "character", assetKind: "image", role: "character", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#4e9bff", sourceNodeId: "image-hero", characterRig: createDirectorCharacterRig() };
    const replaced = replaceDefaultDirectorCharacter(withSet, hero);
    assert.deepEqual(replaced.objects.map((item) => item.id), ["background", "sword", "hero-ref"]);
});

test("平面布景和 720 度全景投影在归一化后保留", () => {
    const base = createDefaultDirectorScene();
    const scene = normalizeDirectorScene({
        ...base,
        objects: [
            { ...base.objects[0], id: "backdrop", primitive: "image", assetKind: "image", role: "background", backgroundProjection: "backdrop", position: [0, 4, -8] },
            { ...base.objects[0], id: "panorama", primitive: "image", assetKind: "image", role: "background", backgroundProjection: "panorama", position: [0, 0, 0] },
        ],
        stage: { ...base.stage, panoramaRotation: 1.2, panoramaRadius: 55 },
    });
    assert.equal(scene.objects.find((item) => item.id === "backdrop")?.backgroundProjection, "backdrop");
    assert.equal(scene.objects.find((item) => item.id === "panorama")?.backgroundProjection, "panorama");
    assert.equal(scene.stage.panoramaRotation, 1.2);
    assert.equal(scene.stage.panoramaRadius, 55);
});

test("切换画幅会更新布景尺寸并保留人物三维站位", () => {
    const base = createDefaultDirectorScene();
    const scene = normalizeDirectorScene({
        ...base,
        objects: [
            { ...base.objects[0], id: "background", primitive: "image", assetKind: "image", role: "background", assetWidth: 1920, assetHeight: 1080, position: [0, 4, -8] },
            { ...base.objects[0], id: "character", position: [1, 0, -2] },
        ],
    });
    const resized = resizeDirectorSceneAspectRatio(scene, "9:16");
    assert.deepEqual(resized.objects.find((item) => item.id === "background")?.displaySize, [5.0625, 9]);
    assert.deepEqual(resized.objects.find((item) => item.id === "character")?.position, [1, 0, -2]);
    assert.deepEqual(directorAssetDisplaySize("character", "16:9", 1200, 1800), [4.68, 7.02]);
});

test("关键帧在三维对象与相机之间插值并可覆盖同一帧", () => {
    const base = createDefaultDirectorScene();
    const scene = {
        ...base,
        keyframes: [
            { id: "start", targetType: "object" as const, targetId: "character-hero", property: "position" as const, time: 0, value: [0, 0, 0] },
            { id: "end", targetType: "object" as const, targetId: "character-hero", property: "position" as const, time: 8, value: [2, 0, -4] },
        ],
    };
    assert.deepEqual(sceneAtTime(scene, 4).objects[0]?.position, [1, 0, -2]);
    const first = upsertTransformKeyframes(scene, "object", "character-hero", 2);
    const second = upsertTransformKeyframes(first, "object", "character-hero", 2);
    assert.equal(second.keyframes.filter((key) => key.targetId === "character-hero" && key.time === 2).length, 3);
});

test("Seedance 提示词包含三维姿态、参考图、机位和连续性", () => {
    const base = createDefaultDirectorScene();
    const hero = { ...applyDirectorPosePreset(base.objects[0]!, "fight"), sourceNodeId: "image-hero", assetKind: "image" as const };
    const prompt = buildSeedanceDirectorPrompt({
        ...base,
        stage: { ...base.stage, scenePosition: [1, 0, -2], sceneRotation: [0, 0.4, 0], sceneScale: 1.8 },
        objects: [hero],
    });
    assert.match(prompt, /三维导演台预演/);
    assert.match(prompt, /场景整体变换：平移\(1,0,-2\)，旋转\(0,0.4,0\)，统一缩放 1.8 倍/);
    assert.match(prompt, /格斗姿态/);
    assert.match(prompt, /体型男性，身高比例1，体宽比例1/);
    assert.match(prompt, /逐关节姿态：躯干\(0.06,-0.25,0\)/);
    assert.match(prompt, /左上臂\(0.55,0.1,-0.78\)/);
    assert.match(prompt, /人物身份与服装参考画布节点 image-hero/);
    assert.match(prompt, /FOV 50/);
    assert.match(prompt, /不跳轴/);
});

test("素材标题能区分人物与背景", () => {
    assert.equal(isLikelyDirectorCharacterAsset({ title: "一位东方墨金神女全身三视图" }), true);
    assert.equal(isLikelyDirectorBackgroundAsset({ title: "山水长卷与远处云海场景" }), true);
});
