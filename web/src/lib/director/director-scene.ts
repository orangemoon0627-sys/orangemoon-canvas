import { nanoid } from "nanoid";

import type { DirectorAspectRatio, DirectorAssetFit, DirectorCamera, DirectorCharacterJoint, DirectorCharacterPosePreset, DirectorCharacterRig, DirectorKeyframe, DirectorLayerRole, DirectorObject, DirectorScene, DirectorVector3 } from "@/types/director";

const DIRECTOR_ASPECT_RATIOS: DirectorAspectRatio[] = ["16:9", "9:16", "1:1", "4:3", "3:4"];
const DIRECTOR_LAYER_ROLES: DirectorLayerRole[] = ["background", "character", "prop", "foreground", "effect"];
const DIRECTOR_LAYER_BANDS: Record<DirectorLayerRole, number> = { background: 0, character: 1, prop: 1, foreground: 2, effect: 2 };
export const DIRECTOR_CHARACTER_JOINTS: DirectorCharacterJoint[] = ["body", "head", "leftUpperArm", "leftForearm", "rightUpperArm", "rightForearm", "leftThigh", "leftCalf", "rightThigh", "rightCalf"];

const ZERO_JOINTS = (): Record<DirectorCharacterJoint, DirectorVector3> => Object.fromEntries(DIRECTOR_CHARACTER_JOINTS.map((joint) => [joint, [0, 0, 0]])) as Record<DirectorCharacterJoint, DirectorVector3>;

export const DIRECTOR_POSE_PRESETS: Record<Exclude<DirectorCharacterPosePreset, "custom">, Partial<Record<DirectorCharacterJoint, DirectorVector3>>> = {
    stand: {},
    "t-pose": { leftUpperArm: [0, 0, -1.48], rightUpperArm: [0, 0, 1.48], leftForearm: [0, 0, -0.08], rightForearm: [0, 0, 0.08] },
    walk: { body: [0.05, 0, 0], leftUpperArm: [0.5, 0, -0.08], rightUpperArm: [-0.5, 0, 0.08], leftThigh: [-0.46, 0, 0], leftCalf: [0.42, 0, 0], rightThigh: [0.45, 0, 0], rightCalf: [0.08, 0, 0] },
    run: { body: [0.22, 0, 0], leftUpperArm: [0.92, 0, -0.24], leftForearm: [-1.2, 0, 0], rightUpperArm: [-0.9, 0, 0.24], rightForearm: [-1.15, 0, 0], leftThigh: [-0.86, 0, 0], leftCalf: [1.18, 0, 0], rightThigh: [0.72, 0, 0], rightCalf: [0.5, 0, 0] },
    sit: { body: [-0.12, 0, 0], leftUpperArm: [0.1, 0, -0.2], rightUpperArm: [0.1, 0, 0.2], leftForearm: [-0.5, 0, 0], rightForearm: [-0.5, 0, 0], leftThigh: [-1.48, 0, 0], rightThigh: [-1.48, 0, 0], leftCalf: [1.45, 0, 0], rightCalf: [1.45, 0, 0] },
    crouch: { body: [0.28, 0, 0], leftThigh: [-0.86, 0, -0.2], rightThigh: [-0.86, 0, 0.2], leftCalf: [1.65, 0, 0], rightCalf: [1.65, 0, 0], leftUpperArm: [0.35, 0, -0.5], rightUpperArm: [0.35, 0, 0.5] },
    kneel: { body: [0.08, 0, 0], leftThigh: [-0.55, 0, 0], leftCalf: [1.65, 0, 0], rightThigh: [-1.32, 0, 0], rightCalf: [1.75, 0, 0], leftUpperArm: [0.1, 0, -0.3], rightUpperArm: [0.1, 0, 0.3] },
    "double-kneel": { body: [0.1, 0, 0], leftThigh: [-1.15, 0, -0.05], leftCalf: [1.65, 0, 0], rightThigh: [-1.15, 0, 0.05], rightCalf: [1.65, 0, 0], leftUpperArm: [0.1, 0, -0.3], rightUpperArm: [0.1, 0, 0.3] },
    fight: { body: [0.06, -0.25, 0], leftUpperArm: [0.55, 0.1, -0.78], leftForearm: [-1.55, 0.15, 0], rightUpperArm: [0.42, -0.25, 0.82], rightForearm: [-1.42, -0.2, 0], leftThigh: [-0.32, 0, -0.18], leftCalf: [0.45, 0, 0], rightThigh: [0.25, 0, 0.18], rightCalf: [0.18, 0, 0] },
    "hands-hips": { body: [0.02, 0, 0], leftUpperArm: [0.36, 0, -0.74], leftForearm: [-0.18, 0, -0.12], rightUpperArm: [0.36, 0, 0.74], rightForearm: [-0.18, 0, 0.12] },
    "hook-punch": { body: [0.08, -0.2, 0], leftUpperArm: [0.76, 0.1, -0.95], leftForearm: [-0.42, 0.1, -0.48], rightUpperArm: [0.2, -0.2, 0.86], rightForearm: [-1.35, -0.15, 0.08], leftThigh: [-0.34, 0, -0.18], leftCalf: [0.5, 0, 0], rightThigh: [0.3, 0, 0.18], rightCalf: [0.2, 0, 0] },
    kick: { body: [0.08, 0.2, 0], leftUpperArm: [0.4, 0, -0.7], rightUpperArm: [0.4, 0, 0.7], leftThigh: [0.1, 0, 0], leftCalf: [0.05, 0, 0], rightThigh: [-1.22, 0, 0.12], rightCalf: [0.5, 0, 0] },
    think: { head: [0, -0.24, 0], rightUpperArm: [-0.8, 0, 0.42], rightForearm: [-0.82, 0, -0.16], leftUpperArm: [0.15, 0, -0.3], leftForearm: [-0.35, 0, 0] },
    "kick-ball": { body: [0.16, 0.2, 0], leftUpperArm: [0.4, 0, -0.7], rightUpperArm: [0.4, 0, 0.7], leftThigh: [0.08, 0, 0], rightThigh: [-1.1, 0, 0.12], rightCalf: [0.62, 0, 0] },
    throw: { body: [0.02, -0.45, 0], leftUpperArm: [-0.9, 0, -0.62], leftForearm: [-0.85, 0, -0.18], rightUpperArm: [-1.08, 0, 0.62], rightForearm: [-0.78, 0, 0.18] },
    bow: { body: [0.46, 0, 0], head: [0.28, 0, 0], leftUpperArm: [0.12, 0, -0.28], rightUpperArm: [0.12, 0, 0.28], leftForearm: [-0.2, 0, 0], rightForearm: [-0.2, 0, 0] },
    wave: { head: [0, -0.12, 0], rightUpperArm: [-1.38, 0, 0.42], rightForearm: [0.02, 0, 0.3], leftUpperArm: [0.15, 0, -0.28], leftForearm: [-0.2, 0, 0] },
    "arms-crossed": { body: [0.02, 0, 0], leftUpperArm: [0.58, 0, -0.76], leftForearm: [-1.18, 0, 0.15], rightUpperArm: [0.58, 0, 0.76], rightForearm: [-1.18, 0, -0.15] },
    phone: { head: [0, -0.25, 0], rightUpperArm: [-0.58, 0, 0.45], rightForearm: [-1.02, 0, 0.2], leftUpperArm: [0.15, 0, -0.25], leftForearm: [-0.4, 0, 0] },
    point: { head: [0, -0.18, 0], leftUpperArm: [0, 0, -0.15], rightUpperArm: [0.05, -0.1, 1.35], rightForearm: [0.02, 0, 0.08] },
    reach: { body: [0.18, 0, 0], leftUpperArm: [-0.25, 0, -0.35], rightUpperArm: [-1.12, 0, 0.42], rightForearm: [-0.22, 0, 0], leftThigh: [-0.25, 0, 0], rightThigh: [0.2, 0, 0] },
};

export function createDefaultDirectorScene(): DirectorScene {
    return {
        version: 2,
        name: "未命名场景",
        duration: 10,
        fps: 24,
        aspectRatio: "16:9",
        compositionMode: "space3d",
        environment: "studio",
        background: "#111317",
        stage: { showGrid: true, showGround: true, showLabels: true, scenePosition: [0, 0, 0], sceneRotation: [0, 0, 0], sceneScale: 1, panoramaRotation: 0, panoramaRadius: 40, ambientIntensity: 1 },
        objects: [
            { id: "character-hero", name: "角色 A", primitive: "character", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#4e9bff", role: "character", layerOrder: 20, characterRig: createDirectorCharacterRig("stand") },
        ],
        cameras: [
            { id: "camera-wide", name: "机位 1", position: [0, 2.2, 7.5], target: [0, 1.15, 0], fov: 50 },
        ],
        shots: [
            { id: "shot-wide", name: "镜头 1", cameraId: "camera-wide", start: 0, end: 10, movement: "static", description: "锁定人物站位、姿态和构图" },
        ],
        keyframes: [],
    };
}

export function createDirectorCharacterRig(posePreset: Exclude<DirectorCharacterPosePreset, "custom"> = "stand"): DirectorCharacterRig {
    return {
        bodyPreset: "male",
        posePreset,
        height: 1,
        width: 1,
        joints: { ...ZERO_JOINTS(), ...DIRECTOR_POSE_PRESETS[posePreset] },
    };
}

export function applyDirectorPosePreset(object: DirectorObject, posePreset: Exclude<DirectorCharacterPosePreset, "custom">): DirectorObject {
    const rig = object.characterRig || createDirectorCharacterRig();
    return { ...object, characterRig: { ...rig, posePreset, joints: { ...ZERO_JOINTS(), ...DIRECTOR_POSE_PRESETS[posePreset] } } };
}

export function updateDirectorCharacterJoint(object: DirectorObject, joint: DirectorCharacterJoint, rotation: DirectorVector3): DirectorObject {
    const rig = object.characterRig || createDirectorCharacterRig();
    return { ...object, characterRig: { ...rig, posePreset: "custom", joints: { ...rig.joints, [joint]: rotation } } };
}

export function isDefaultDirectorPlaceholder(object: DirectorObject) {
    return object.id === "character-hero" || object.id === "character-rival" || object.id === "prop-pillar";
}

export function isDirectorAssetObject(object: DirectorObject) {
    return Boolean(object.assetKind || object.primitive === "image" || object.primitive === "video");
}

export function isLikelyDirectorCharacterAsset(value: { name?: string; title?: string }) {
    return /(?:人物|角色|主角|男主|女主|立绘|全身|三视图|脸部|表情|神女|仙女|少女|少年|女子|男子|character|portrait|person)/i.test(`${value.name || ""} ${value.title || ""}`);
}

export function isLikelyDirectorBackgroundAsset(value: { name?: string; title?: string }) {
    return /(?:背景|场景|环境|庭院|室内|外景|空间|山水|山河|卷轴|山峦|云海|landscape|background|environment|scene)/i.test(`${value.name || ""} ${value.title || ""}`);
}

/** Remove the starter shapes once a scene is being used with real canvas assets. */
export function removeDefaultDirectorPlaceholders(scene: DirectorScene) {
    const placeholderIds = new Set(scene.objects.filter(isDefaultDirectorPlaceholder).map((object) => object.id));
    if (!placeholderIds.size) return scene;
    const objects = scene.objects.filter((object) => !placeholderIds.has(object.id));
    return {
        ...scene,
        objects,
        keyframes: scene.keyframes.filter((keyframe) => !placeholderIds.has(keyframe.targetId)),
    };
}

export function replaceDefaultDirectorCharacter(scene: DirectorScene, object: DirectorObject) {
    const starterIds = new Set(scene.objects
        .filter((item) => isDefaultDirectorPlaceholder(item) && item.role === "character" && !item.sourceNodeId)
        .map((item) => item.id));
    const objects = scene.objects.filter((item) => !starterIds.has(item.id));
    return {
        ...scene,
        objects: placeDirectorLayer(objects, object),
        keyframes: scene.keyframes.filter((keyframe) => !starterIds.has(keyframe.targetId)),
    };
}

export function normalizeDirectorScene(value: unknown): DirectorScene {
    const fallback = createDefaultDirectorScene();
    if (!value || typeof value !== "object") return fallback;
    const scene = value as Partial<DirectorScene>;
    const cameras = Array.isArray(scene.cameras) && scene.cameras.length ? scene.cameras.map(normalizeCamera) : fallback.cameras;
    const cameraIds = new Set(cameras.map((camera) => camera.id));
    const duration = clamp(numberValue(scene.duration, fallback.duration), 1, 120);
    const aspectRatio = DIRECTOR_ASPECT_RATIOS.includes(scene.aspectRatio as DirectorAspectRatio) ? scene.aspectRatio as DirectorAspectRatio : fallback.aspectRatio;
    const normalizedObjects = Array.isArray(scene.objects) ? scene.objects.map((object, index) => normalizeObject(object, index, aspectRatio)) : fallback.objects;
    const hasReferencedCharacter = normalizedObjects.some((object) => !isDefaultDirectorPlaceholder(object) && object.role === "character" && isDirectorAssetObject(object));
    const objects = hasReferencedCharacter
        ? normalizedObjects.filter((object) => !isDefaultDirectorPlaceholder(object) || object.role !== "character")
        : normalizedObjects;
    const objectIds = new Set(objects.map((object) => object.id));
    return {
        ...fallback,
        ...scene,
        version: 2,
        name: stringValue(scene.name, fallback.name),
        duration,
        fps: Math.round(clamp(numberValue(scene.fps, fallback.fps), 12, 60)),
        aspectRatio,
        compositionMode: "space3d",
        stage: normalizeStage(scene.stage, fallback.stage),
        objects,
        cameras,
        shots: Array.isArray(scene.shots)
            ? scene.shots.filter((shot) => shot && cameraIds.has(shot.cameraId)).map((shot) => ({ ...shot, start: clamp(numberValue(shot.start, 0), 0, duration), end: clamp(numberValue(shot.end, duration), 0, duration) })).filter((shot) => shot.end > shot.start)
            : fallback.shots,
        keyframes: (Array.isArray(scene.keyframes) ? scene.keyframes : fallback.keyframes)
            .filter((keyframe) => keyframe.targetType !== "object" || objectIds.has(keyframe.targetId))
            .map((keyframe) => ({ ...keyframe, time: clamp(numberValue(keyframe.time, 0), 0, duration), value: Array.isArray(keyframe.value) ? keyframe.value.map(Number).filter(Number.isFinite) : [] })),
    };
}

export function sceneAtTime(scene: DirectorScene, time: number) {
    const currentTime = clamp(time, 0, scene.duration);
    const objects = scene.objects.map((object) => ({
        ...object,
        position: vectorAt(scene.keyframes, "object", object.id, "position", currentTime, object.position),
        rotation: vectorAt(scene.keyframes, "object", object.id, "rotation", currentTime, object.rotation),
        scale: vectorAt(scene.keyframes, "object", object.id, "scale", currentTime, object.scale),
    }));
    const shot = [...scene.shots].sort((left, right) => left.start - right.start).find((item) => currentTime >= item.start && currentTime <= item.end) || scene.shots[0];
    const camera = directorCameraAtTime(scene, shot?.cameraId || scene.cameras[0]?.id || "", currentTime);
    return { objects: scene.compositionMode === "layers" ? sortDirectorLayers(objects) : objects, camera, shot };
}

export function directorCameraAtTime(scene: DirectorScene, cameraId: string, time: number) {
    const currentTime = clamp(time, 0, scene.duration);
    const baseCamera = scene.cameras.find((camera) => camera.id === cameraId) || scene.cameras[0];
    return baseCamera ? {
        ...baseCamera,
        position: vectorAt(scene.keyframes, "camera", baseCamera.id, "position", currentTime, baseCamera.position),
        target: vectorAt(scene.keyframes, "camera", baseCamera.id, "target", currentTime, baseCamera.target),
        fov: scalarAt(scene.keyframes, baseCamera.id, "fov", currentTime, baseCamera.fov),
    } : fallbackCamera();
}

export function sortDirectorLayers(objects: DirectorObject[]) {
    return objects
        .map((object, index) => ({ object, index }))
        .sort((left, right) => {
            const roleOrder = directorLayerRoleRank(left.object.role) - directorLayerRoleRank(right.object.role);
            if (roleOrder) return roleOrder;
            const layerOrder = (left.object.layerOrder ?? 0) - (right.object.layerOrder ?? 0);
            return layerOrder || left.index - right.index;
        })
        .map(({ object }) => object);
}

export function directorLayerRoleRank(role: DirectorLayerRole | undefined) {
    return DIRECTOR_LAYER_BANDS[role || "prop"];
}

export function renumberDirectorLayers(objects: DirectorObject[]) {
    return objects.map((object, index) => ({ ...object, layerOrder: (index + 1) * 10 }));
}

/** Insert a layer in the visual order used by the stage: background, subjects, then overlays. */
export function placeDirectorLayer(objects: DirectorObject[], object: DirectorObject) {
    const ordered = sortDirectorLayers(objects.filter((item) => item.id !== object.id));
    const role = object.role || "prop";
    const firstSubjectIndex = ordered.findIndex((item) => item.role !== "background");
    const firstOverlayIndex = ordered.findIndex((item) => item.role === "foreground" || item.role === "effect");
    const index = role === "background"
        ? firstSubjectIndex === -1 ? ordered.length : firstSubjectIndex
        : role === "foreground" || role === "effect"
          ? ordered.length
          : firstOverlayIndex === -1 ? ordered.length : firstOverlayIndex;
    ordered.splice(Math.max(0, index), 0, object);
    return renumberDirectorLayers(ordered);
}

/** Move a layer inside its visual band without allowing semantic depth to be violated. */
export function moveDirectorLayer(objects: DirectorObject[], id: string, direction: "up" | "down" | "top" | "bottom") {
    const ordered = sortDirectorLayers(objects);
    const index = ordered.findIndex((item) => item.id === id);
    if (index < 0) return objects;
    const band = directorLayerRoleRank(ordered[index].role);
    const bandIndexes = ordered
        .map((item, itemIndex) => ({ item, itemIndex }))
        .filter(({ item }) => directorLayerRoleRank(item.role) === band)
        .map(({ itemIndex }) => itemIndex);
    const bandIndex = bandIndexes.indexOf(index);
    if (bandIndex < 0) return objects;
    const nextBandIndex = direction === "top"
        ? bandIndexes.length - 1
        : direction === "bottom"
          ? 0
          : direction === "up"
            ? Math.min(bandIndexes.length - 1, bandIndex + 1)
            : Math.max(0, bandIndex - 1);
    if (nextBandIndex === bandIndex) return ordered;
    const targetIndex = bandIndexes[nextBandIndex];
    const [item] = ordered.splice(index, 1);
    ordered.splice(targetIndex, 0, item);
    return renumberDirectorLayers(ordered);
}

export function canMoveDirectorLayer(objects: DirectorObject[], id: string, direction: "up" | "down") {
    const ordered = sortDirectorLayers(objects);
    const index = ordered.findIndex((item) => item.id === id);
    if (index < 0) return false;
    const neighbor = ordered[index + (direction === "up" ? 1 : -1)];
    return Boolean(neighbor && directorLayerRoleRank(neighbor.role) === directorLayerRoleRank(ordered[index].role));
}

export function directorLayerRoleLabel(role: DirectorLayerRole | undefined) {
    return ({ background: "背景", character: "人物", prop: "道具", foreground: "前景", effect: "特效" } as const)[role || "prop"];
}

export function directorLayerZ(layerOrder: number | undefined) {
    return -10 + (layerOrder ?? 0) * 0.01;
}

export function directorFrameSize(aspectRatio: DirectorAspectRatio): [number, number] {
    const [width, height] = aspectRatio.split(":").map(Number);
    const frameHeight = 9;
    return [frameHeight * width / Math.max(1, height), frameHeight];
}

export function defaultDirectorAssetFit(role: DirectorLayerRole): DirectorAssetFit {
    return role === "background" ? "cover" : "contain";
}

export function directorAssetDisplaySize(role: DirectorLayerRole, aspectRatio: DirectorAspectRatio, sourceWidth = 1024, sourceHeight = 1024): [number, number] {
    const frame = directorFrameSize(aspectRatio);
    if (role === "background" || role === "foreground" || role === "effect") return frame;
    const maxWidth = Math.min(role === "character" ? 7 : 5.2, frame[0] * 0.82);
    const maxHeight = frame[1] * (role === "character" ? 0.78 : 0.56);
    const factor = Math.min(maxWidth / Math.max(1, sourceWidth), maxHeight / Math.max(1, sourceHeight));
    return [stableDimension(Math.max(0.5, sourceWidth * factor)), stableDimension(Math.max(0.5, sourceHeight * factor))];
}

export function configureDirectorObjectRole(object: DirectorObject, role: DirectorLayerRole, aspectRatio: DirectorAspectRatio): DirectorObject {
    const asset = isDirectorAssetObject(object);
    const leavingBackground = object.role === "background" && role !== "background";
    return {
        ...object,
        role,
        ...(asset ? {
            displaySize: directorAssetDisplaySize(role, aspectRatio, object.assetWidth, object.assetHeight),
            fit: defaultDirectorAssetFit(role),
        } : {}),
        position: role === "background" ? [0, 0, object.position[2]] : leavingBackground ? [0, -0.7, object.position[2]] : object.position,
        rotation: role === "background" || leavingBackground ? [0, 0, 0] : object.rotation,
        scale: role === "background" || leavingBackground ? [1, 1, 1] : object.scale,
    };
}

export function resizeDirectorSceneAspectRatio(scene: DirectorScene, aspectRatio: DirectorAspectRatio): DirectorScene {
    return {
        ...scene,
        aspectRatio,
        objects: scene.objects.map((object) => object.role === "background" && isDirectorAssetObject(object)
            ? { ...object, displaySize: directorAssetDisplaySize("background", aspectRatio, object.assetWidth, object.assetHeight), fit: object.fit || "cover" }
            : object),
    };
}

export function upsertTransformKeyframes(scene: DirectorScene, targetType: "object" | "camera", targetId: string, time: number) {
    const target = targetType === "object" ? scene.objects.find((item) => item.id === targetId) : scene.cameras.find((item) => item.id === targetId);
    if (!target) return scene;
    const entries: Array<{ property: DirectorKeyframe["property"]; value: number[] }> = targetType === "object"
        ? [
              { property: "position", value: (target as DirectorObject).position },
              { property: "rotation", value: (target as DirectorObject).rotation },
              { property: "scale", value: (target as DirectorObject).scale },
          ]
        : [
              { property: "position", value: (target as DirectorCamera).position },
              { property: "target", value: (target as DirectorCamera).target },
              { property: "fov", value: [(target as DirectorCamera).fov] },
          ];
    const roundedTime = Math.round(clamp(time, 0, scene.duration) * scene.fps) / scene.fps;
    const keys = scene.keyframes.filter((keyframe) => !(keyframe.targetType === targetType && keyframe.targetId === targetId && entries.some((entry) => entry.property === keyframe.property) && Math.abs(keyframe.time - roundedTime) < 0.001));
    return { ...scene, keyframes: [...keys, ...entries.map((entry) => ({ id: `key-${nanoid()}`, targetType, targetId, property: entry.property, time: roundedTime, value: [...entry.value] }))] };
}

export function buildSeedanceDirectorPrompt(scene: DirectorScene) {
    const objectText = sortDirectorLayers(scene.objects.filter((object) => object.visible !== false)).map((object) => {
        const reference = object.sourceNodeId
            ? object.role === "character" ? `，人物身份与服装参考画布节点 ${object.sourceNodeId}` : `，来自画布素材节点 ${object.sourceNodeId}`
            : "";
        const pose = object.primitive === "character" && object.characterRig
            ? `，${describeCharacterRig(object.characterRig)}`
            : "";
        const projection = object.role === "background" && object.assetKind
            ? object.backgroundProjection === "panorama" ? "，720° 全景环境" : "，平面布景板"
            : "";
        return `${directorLayerRoleLabel(object.role)}「${object.name}」位于(${formatVector(object.position)})${reference}${pose}${projection}，朝向(${formatVector(object.rotation)})`;
    }).join("；");
    const shots = [...scene.shots].sort((left, right) => left.start - right.start).map((shot, index) => {
        const camera = scene.cameras.find((item) => item.id === shot.cameraId);
        return `镜头${index + 1} [${formatTime(shot.start)}-${formatTime(shot.end)}] ${shot.name}：${movementLabel(shot.movement)}，${camera ? `${camera.name}，FOV ${camera.fov}°，机位(${formatVector(camera.position)})看向(${formatVector(camera.target)})` : "保持当前机位"}${shot.description ? `，${shot.description}` : ""}`;
    });
    const animated = [...new Set(scene.keyframes.map((keyframe) => [...scene.objects, ...scene.cameras].find((item) => item.id === keyframe.targetId)?.name).filter(Boolean))].join("、");
    return [
        `${scene.duration}秒，${scene.aspectRatio}，${scene.fps}fps，三维导演台预演，${environmentLabel(scene.environment)}。`,
        `场景整体变换：平移(${formatVector(scene.stage.scenePosition)})，旋转(${formatVector(scene.stage.sceneRotation)})，统一缩放 ${formatNumber(scene.stage.sceneScale)} 倍。`,
        objectText ? `空间调度：${objectText}。` : "",
        "严格参考导演台中的人物站位、朝向、肢体姿态、遮挡关系、机位位置、注视点与 FOV；三维素体只约束构图和动作，人物身份与服装以绑定的画布参考图为准。",
        ...shots,
        animated ? `连续性要求：${animated}按关键帧平滑运动，人物身份、服装、空间方位和光线方向保持一致；镜头切换动作连续，不跳轴。` : "人物身份、空间方位和光线方向保持一致，镜头切换不跳轴。",
        "画面要求：电影级真实材质与体积光，动作清晰，主体轮廓稳定，无文字、无水印、无多余肢体、无闪烁。",
    ].filter(Boolean).join("\n");
}

function normalizeObject(object: DirectorObject, index = 0, aspectRatio: DirectorAspectRatio = "16:9"): DirectorObject {
    const requestedPrimitive = (["character", "box", "sphere", "cylinder", "cone", "model", "image", "video"] as const).includes(object.primitive) ? object.primitive : "box";
    const assetKind = object.assetKind || (requestedPrimitive === "image" || requestedPrimitive === "video" ? requestedPrimitive : undefined);
    const primitive = object.role === "character" && assetKind ? "character" : requestedPrimitive;
    const defaultRole: DirectorLayerRole = assetKind === "image" || assetKind === "video" ? (index === 0 ? "background" : "character") : primitive === "character" ? "character" : "prop";
    const role = DIRECTOR_LAYER_ROLES.includes(object.role as DirectorLayerRole) ? object.role as DirectorLayerRole : defaultRole;
    const width = numberValue(object.assetWidth, 1024);
    const height = numberValue(object.assetHeight, 1024);
    const fallbackSize = directorAssetDisplaySize(role, aspectRatio, width, height);
    const displaySize: [number, number] = Array.isArray(object.displaySize) && object.displaySize.length >= 2
        ? [Math.max(0.1, numberValue(object.displaySize[0], fallbackSize[0])), Math.max(0.1, numberValue(object.displaySize[1], fallbackSize[1]))]
        : fallbackSize;
    const fit = object.fit === "cover" || object.fit === "contain" ? object.fit : defaultDirectorAssetFit(role);
    const characterRig = primitive === "character" ? normalizeCharacterRig(object.characterRig) : undefined;
    const backgroundProjection = object.backgroundProjection === "panorama" ? "panorama" : "backdrop";
    const rawPosition = vectorValue(object.position, role === "background" ? [0, 4, -8] : [0, 0, 0]);
    const position: DirectorVector3 = role === "background" && assetKind && rawPosition.every((value) => Math.abs(value) < 0.001)
        ? [0, 4, -8]
        : role === "character" && rawPosition[1] < 0 ? [rawPosition[0], 0, rawPosition[2]] : rawPosition;
    return { ...object, id: stringValue(object.id, `object-${nanoid()}`), name: stringValue(object.name, "未命名对象"), primitive, position, rotation: vectorValue(object.rotation, [0, 0, 0]), scale: vectorValue(object.scale, [1, 1, 1]), ...(assetKind ? { displaySize, fit, assetKind, assetWidth: width, assetHeight: height, backgroundProjection } : {}), ...(characterRig ? { characterRig } : {}), role, layerOrder: numberValue(object.layerOrder, (index + 1) * 10), opacity: clamp(numberValue(object.opacity, 1), 0, 1), color: /^#[0-9a-f]{6}$/i.test(object.color || "") ? object.color : "#e9583e", visible: object.visible !== false, locked: object.locked === true };
}

function normalizeCharacterRig(value: unknown): DirectorCharacterRig {
    const input = value && typeof value === "object" ? value as Partial<DirectorCharacterRig> : {};
    const defaultRig = createDirectorCharacterRig();
    const bodyPreset = (["male", "female", "strong", "slim", "child", "broad", "teen", "chibi"] as const).includes(input.bodyPreset as DirectorCharacterRig["bodyPreset"]) ? input.bodyPreset as DirectorCharacterRig["bodyPreset"] : defaultRig.bodyPreset;
    const posePreset = (["stand", "t-pose", "walk", "run", "sit", "crouch", "kneel", "double-kneel", "fight", "hands-hips", "hook-punch", "kick", "think", "kick-ball", "throw", "bow", "wave", "arms-crossed", "phone", "point", "reach", "custom"] as const).includes(input.posePreset as DirectorCharacterRig["posePreset"]) ? input.posePreset as DirectorCharacterRig["posePreset"] : defaultRig.posePreset;
    const poseRig = posePreset === "custom" ? defaultRig : createDirectorCharacterRig(posePreset);
    const rawJoints: Partial<Record<DirectorCharacterJoint, DirectorVector3>> = input.joints && typeof input.joints === "object" ? input.joints : {};
    const joints = Object.fromEntries(DIRECTOR_CHARACTER_JOINTS.map((joint) => [joint, vectorValue(rawJoints[joint], poseRig.joints[joint])])) as Record<DirectorCharacterJoint, DirectorVector3>;
    return { bodyPreset, posePreset, height: clamp(numberValue(input.height, 1), 0.5, 1.8), width: clamp(numberValue(input.width, 1), 0.55, 1.8), joints };
}

function normalizeStage(value: unknown, fallback: DirectorScene["stage"]): DirectorScene["stage"] {
    const input = value && typeof value === "object" ? value as Partial<DirectorScene["stage"]> : {};
    return {
        showGrid: input.showGrid !== false,
        showGround: input.showGround !== false,
        showLabels: input.showLabels !== false,
        scenePosition: vectorValue(input.scenePosition, fallback.scenePosition),
        sceneRotation: vectorValue(input.sceneRotation, fallback.sceneRotation),
        sceneScale: clamp(numberValue(input.sceneScale, fallback.sceneScale), 0.1, 10),
        panoramaRotation: clamp(numberValue(input.panoramaRotation, fallback.panoramaRotation), -Math.PI * 2, Math.PI * 2),
        panoramaRadius: clamp(numberValue(input.panoramaRadius, fallback.panoramaRadius), 10, 100),
        ambientIntensity: clamp(numberValue(input.ambientIntensity, fallback.ambientIntensity), 0, 3),
    };
}

function normalizeCamera(camera: DirectorCamera): DirectorCamera {
    return { ...camera, id: stringValue(camera.id, `camera-${nanoid()}`), name: stringValue(camera.name, "未命名机位"), position: vectorValue(camera.position, [6, 4, 8]), target: vectorValue(camera.target, [0, 1, 0]), fov: clamp(numberValue(camera.fov, 42), 15, 100) };
}

function vectorAt(keys: DirectorKeyframe[], targetType: DirectorKeyframe["targetType"], targetId: string, property: DirectorKeyframe["property"], time: number, fallback: DirectorVector3): DirectorVector3 {
    const values = keys.filter((key) => key.targetType === targetType && key.targetId === targetId && key.property === property && key.value.length >= 3).sort((left, right) => left.time - right.time);
    const pair = surrounding(values, time);
    if (!pair) return fallback;
    if (pair[0] === pair[1]) return vectorValue(pair[0].value, fallback);
    const ratio = (time - pair[0].time) / Math.max(0.0001, pair[1].time - pair[0].time);
    return [0, 1, 2].map((index) => lerp(pair[0].value[index], pair[1].value[index], ratio)) as DirectorVector3;
}

function scalarAt(keys: DirectorKeyframe[], targetId: string, property: DirectorKeyframe["property"], time: number, fallback: number) {
    const values = keys.filter((key) => key.targetType === "camera" && key.targetId === targetId && key.property === property && key.value.length).sort((left, right) => left.time - right.time);
    const pair = surrounding(values, time);
    if (!pair) return fallback;
    if (pair[0] === pair[1]) return pair[0].value[0] ?? fallback;
    return lerp(pair[0].value[0], pair[1].value[0], (time - pair[0].time) / Math.max(0.0001, pair[1].time - pair[0].time));
}

function surrounding(values: DirectorKeyframe[], time: number): [DirectorKeyframe, DirectorKeyframe] | null {
    if (!values.length) return null;
    const before = [...values].reverse().find((key) => key.time <= time) || values[0];
    const after = values.find((key) => key.time >= time) || values[values.length - 1];
    return [before, after];
}

function fallbackCamera(): DirectorCamera { return { id: "camera-default", name: "默认机位", position: [6, 4, 8], target: [0, 1, 0], fov: 42 }; }
function vectorValue(value: unknown, fallback: DirectorVector3): DirectorVector3 { return Array.isArray(value) && value.length >= 3 ? [numberValue(value[0], fallback[0]), numberValue(value[1], fallback[1]), numberValue(value[2], fallback[2])] : fallback; }
function numberValue(value: unknown, fallback: number) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function stringValue(value: unknown, fallback: string) { return typeof value === "string" && value.trim() ? value.trim() : fallback; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function stableDimension(value: number) { return Number(value.toFixed(6)); }
function lerp(from: number, to: number, amount: number) { return from + (to - from) * clamp(amount, 0, 1); }
function formatVector(value: DirectorVector3) { return value.map((item) => Number(item.toFixed(2))).join(","); }
function formatNumber(value: number) { return Number(value.toFixed(2)); }
function formatTime(value: number) { return `${Number(value.toFixed(2))}s`; }
function movementLabel(value: DirectorScene["shots"][number]["movement"]) { return ({ static: "固定机位", "push-in": "缓慢推近", "pull-out": "缓慢拉远", "pan-left": "向左摇摄", "pan-right": "向右摇摄", orbit: "环绕主体", follow: "跟随主体" } as const)[value]; }
function environmentLabel(value: DirectorScene["environment"]) { return ({ studio: "摄影棚布光", courtyard: "东方院落", mountain: "山地云海", desert: "荒漠风沙", space: "太空场景" } as const)[value]; }
function posePresetLabel(value: DirectorCharacterPosePreset) { return ({ stand: "站立姿态", "t-pose": "T 型姿态", walk: "行走姿态", run: "跑步姿态", sit: "坐姿", crouch: "蹲姿", kneel: "单膝跪姿", "double-kneel": "双膝跪姿", fight: "格斗姿态", "hands-hips": "叉腰姿态", "hook-punch": "勾拳姿态", kick: "踢腿姿态", think: "思考姿态", "kick-ball": "踢球姿态", throw: "投掷姿态", bow: "鞠躬姿态", wave: "挥手姿态", "arms-crossed": "抱臂姿态", phone: "看手机姿态", point: "指向姿态", reach: "伸手姿态", custom: "自定义关节姿态" } as const)[value]; }
function bodyPresetLabel(value: DirectorCharacterRig["bodyPreset"]) { return ({ male: "男性", female: "女性", strong: "健壮", slim: "纤细", child: "少年", broad: "魁梧", teen: "青少年", chibi: "二头身" } as const)[value]; }

function describeCharacterRig(rig: DirectorCharacterRig) {
    const joints = DIRECTOR_CHARACTER_JOINTS
        .filter((joint) => rig.joints[joint].some((value) => Math.abs(value) >= 0.04))
        .map((joint) => `${directorJointLabel(joint)}(${formatVector(rig.joints[joint])})`);
    const jointText = joints.length ? `，逐关节姿态：${joints.join("；")}` : "，全身自然放松、四肢垂直";
    return `${posePresetLabel(rig.posePreset)}，体型${bodyPresetLabel(rig.bodyPreset)}，身高比例${formatNumber(rig.height)}，体宽比例${formatNumber(rig.width)}${jointText}`;
}

function directorJointLabel(value: DirectorCharacterJoint) {
    return ({ body: "躯干", head: "头部", leftUpperArm: "左上臂", leftForearm: "左前臂", rightUpperArm: "右上臂", rightForearm: "右前臂", leftThigh: "左大腿", leftCalf: "左小腿", rightThigh: "右大腿", rightCalf: "右小腿" } as const)[value];
}
