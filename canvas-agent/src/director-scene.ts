import crypto from "node:crypto";

import type { DirectorAssetFit, DirectorCamera, DirectorCharacterJoint, DirectorCharacterPosePreset, DirectorCharacterRig, DirectorKeyframe, DirectorLayerRole, DirectorObject, DirectorScene, DirectorVector3 } from "./types.js";

const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;
const ENVIRONMENTS = ["studio", "courtyard", "mountain", "desert", "space"] as const;
const LAYER_ROLES = ["background", "character", "prop", "foreground", "effect"] as const;
const LAYER_BANDS: Record<DirectorLayerRole, number> = { background: 0, character: 1, prop: 1, foreground: 2, effect: 2 };
const PRIMITIVES = ["character", "box", "sphere", "cylinder", "cone", "model", "image", "video"] as const;
const MOVEMENTS = ["static", "push-in", "pull-out", "pan-left", "pan-right", "orbit", "follow"] as const;
const KEYFRAME_PROPERTIES = ["position", "rotation", "scale", "target", "fov"] as const;
const CHARACTER_JOINTS: DirectorCharacterJoint[] = ["body", "head", "leftUpperArm", "leftForearm", "rightUpperArm", "rightForearm", "leftThigh", "leftCalf", "rightThigh", "rightCalf"];
const BODY_PRESETS = ["male", "female", "strong", "slim", "child", "broad", "teen", "chibi"] as const;
const POSE_PRESETS = ["stand", "t-pose", "walk", "run", "sit", "crouch", "kneel", "double-kneel", "fight", "hands-hips", "hook-punch", "kick", "think", "kick-ball", "throw", "bow", "wave", "arms-crossed", "phone", "point", "reach", "custom"] as const;

const ZERO_JOINTS = (): Record<DirectorCharacterJoint, DirectorVector3> => Object.fromEntries(CHARACTER_JOINTS.map((joint) => [joint, [0, 0, 0]])) as Record<DirectorCharacterJoint, DirectorVector3>;
const POSE_JOINTS: Record<Exclude<DirectorCharacterPosePreset, "custom">, Partial<Record<DirectorCharacterJoint, DirectorVector3>>> = {
    stand: {},
    "t-pose": { leftUpperArm: [0, 0, -1.48], rightUpperArm: [0, 0, 1.48] },
    walk: { leftUpperArm: [0.5, 0, -0.08], rightUpperArm: [-0.5, 0, 0.08], leftThigh: [-0.46, 0, 0], leftCalf: [0.42, 0, 0], rightThigh: [0.45, 0, 0] },
    run: { body: [0.22, 0, 0], leftUpperArm: [0.92, 0, -0.24], leftForearm: [-1.2, 0, 0], rightUpperArm: [-0.9, 0, 0.24], rightForearm: [-1.15, 0, 0], leftThigh: [-0.86, 0, 0], leftCalf: [1.18, 0, 0], rightThigh: [0.72, 0, 0], rightCalf: [0.5, 0, 0] },
    sit: { body: [-0.12, 0, 0], leftForearm: [-0.5, 0, 0], rightForearm: [-0.5, 0, 0], leftThigh: [-1.48, 0, 0], rightThigh: [-1.48, 0, 0], leftCalf: [1.45, 0, 0], rightCalf: [1.45, 0, 0] },
    crouch: { body: [0.28, 0, 0], leftThigh: [-0.86, 0, -0.2], rightThigh: [-0.86, 0, 0.2], leftCalf: [1.65, 0, 0], rightCalf: [1.65, 0, 0] },
    kneel: { leftThigh: [-0.55, 0, 0], leftCalf: [1.65, 0, 0], rightThigh: [-1.32, 0, 0], rightCalf: [1.75, 0, 0] },
    "double-kneel": { body: [0.1, 0, 0], leftThigh: [-1.15, 0, -0.05], leftCalf: [1.65, 0, 0], rightThigh: [-1.15, 0, 0.05], rightCalf: [1.65, 0, 0] },
    fight: { body: [0.06, -0.25, 0], leftUpperArm: [0.55, 0.1, -0.78], leftForearm: [-1.55, 0.15, 0], rightUpperArm: [0.42, -0.25, 0.82], rightForearm: [-1.42, -0.2, 0], leftThigh: [-0.32, 0, -0.18], rightThigh: [0.25, 0, 0.18] },
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
    point: { head: [0, -0.18, 0], rightUpperArm: [0.05, -0.1, 1.35], rightForearm: [0.02, 0, 0.08] },
    reach: { body: [0.18, 0, 0], rightUpperArm: [-1.12, 0, 0.42], rightForearm: [-0.22, 0, 0] },
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
            { id: "character-hero", name: "角色 A", primitive: "character", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#4e9bff", role: "character", layerOrder: 20, characterRig: createCharacterRig() },
        ],
        cameras: [{ id: "camera-wide", name: "机位 1", position: [0, 2.2, 7.5], target: [0, 1.15, 0], fov: 50 }],
        shots: [{ id: "shot-wide", name: "镜头 1", cameraId: "camera-wide", start: 0, end: 10, movement: "static", description: "锁定人物站位、姿态和构图" }],
        keyframes: [],
    };
}

export function mergeDirectorScene(current: unknown, patch: unknown, replace = false) {
    const base = normalizeDirectorScene(current);
    const next = patch && typeof patch === "object" && !Array.isArray(patch) ? patch as Partial<DirectorScene> : {};
    return normalizeDirectorScene(replace ? next : { ...base, ...next });
}

export function normalizeDirectorScene(value: unknown): DirectorScene {
    const fallback = createDefaultDirectorScene();
    const scene = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<DirectorScene> : {};
    const duration = clamp(numberValue(scene.duration, fallback.duration), 1, 120);
    const aspectRatio = includes(ASPECT_RATIOS, scene.aspectRatio) ? scene.aspectRatio : fallback.aspectRatio;
    const cameras = Array.isArray(scene.cameras) && scene.cameras.length ? scene.cameras.slice(0, 24).map(normalizeCamera) : fallback.cameras;
    const cameraIds = new Set(cameras.map((camera) => camera.id));
    const rawObjects = Array.isArray(scene.objects) ? scene.objects.slice(0, 80) : fallback.objects;
    const normalizedObjects = rawObjects.map((object, index) => normalizeObject(object, index, aspectRatio));
    const objects = normalizedObjects.some(isDirectorAssetObject) ? normalizedObjects.filter((object) => !isDefaultDirectorPlaceholder(object)) : normalizedObjects;
    const objectIds = new Set(objects.map((object) => object.id));
    const shots = Array.isArray(scene.shots)
        ? scene.shots.slice(0, 80).flatMap((shot, index) => normalizeShot(shot, index, duration, cameraIds))
        : fallback.shots;
    const keyframes = Array.isArray(scene.keyframes)
        ? scene.keyframes.slice(0, 800).flatMap((keyframe) => normalizeKeyframe(keyframe, duration, objectIds, cameraIds))
        : fallback.keyframes;
    return {
        version: 2,
        name: stringValue(scene.name, fallback.name),
        duration,
        fps: Math.round(clamp(numberValue(scene.fps, fallback.fps), 12, 60)),
        aspectRatio,
        compositionMode: "space3d",
        environment: includes(ENVIRONMENTS, scene.environment) ? scene.environment : fallback.environment,
        background: /^#[0-9a-f]{6}$/i.test(String(scene.background || "")) ? String(scene.background) : fallback.background,
        stage: normalizeStage(scene.stage, fallback.stage),
        objects,
        cameras,
        shots,
        keyframes,
    };
}

export function buildSeedanceDirectorPrompt(sceneInput: unknown) {
    const scene = normalizeDirectorScene(sceneInput);
    const objectText = sortDirectorLayers(scene.objects.filter((object) => object.visible !== false)).map((object) => {
        const assetText = isDirectorAssetObject(object)
            ? `，画布${object.assetKind === "video" ? "视频" : "图片"}素材${object.sourceNodeId ? `节点 ${object.sourceNodeId}` : ""}${object.fit === "cover" ? "铺满裁切" : "完整保留"}`
            : "";
        const pose = object.primitive === "character" && object.characterRig ? `，${describeCharacterRig(object.characterRig)}` : "";
        const projection = object.role === "background" && isDirectorAssetObject(object)
            ? object.backgroundProjection === "panorama" ? "，720° 全景环境" : "，平面布景板"
            : "";
        return `${directorLayerRoleLabel(object.role)}层「${object.name}」位于(${formatVector(object.position)})${assetText}${pose}${projection}，朝向(${formatVector(object.rotation)})`;
    }).join("；");
    const shots = [...scene.shots].sort((left, right) => left.start - right.start).map((shot, index) => {
        const camera = scene.cameras.find((item) => item.id === shot.cameraId);
        return `镜头${index + 1} [${formatTime(shot.start)}-${formatTime(shot.end)}] ${shot.name}：${movementLabel(shot.movement)}，${camera ? `${camera.name}，FOV ${camera.fov}°，机位(${formatVector(camera.position)})看向(${formatVector(camera.target)})` : "保持当前机位"}${shot.description ? `，${shot.description}` : ""}`;
    });
    const targets = [...scene.objects, ...scene.cameras];
    const animated = [...new Set(scene.keyframes.map((keyframe) => targets.find((item) => item.id === keyframe.targetId)?.name).filter(Boolean))].join("、");
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
    return LAYER_BANDS[role || "prop"];
}

export function directorLayerRoleLabel(role: DirectorLayerRole | undefined) {
    return ({ background: "背景", character: "人物", prop: "道具", foreground: "前景", effect: "特效" } as const)[role || "prop"];
}

export function directorFrameSize(aspectRatio: DirectorScene["aspectRatio"]): [number, number] {
    const [width, height] = aspectRatio.split(":").map(Number);
    const frameHeight = 9;
    return [frameHeight * width / Math.max(1, height), frameHeight];
}

export function defaultDirectorAssetFit(role: DirectorLayerRole): DirectorAssetFit {
    return role === "background" ? "cover" : "contain";
}

export function directorAssetDisplaySize(role: DirectorLayerRole, aspectRatio: DirectorScene["aspectRatio"], sourceWidth = 1024, sourceHeight = 1024): [number, number] {
    const frame = directorFrameSize(aspectRatio);
    if (role === "background" || role === "foreground" || role === "effect") return frame;
    const maxWidth = Math.min(role === "character" ? 7 : 5.2, frame[0] * 0.82);
    const maxHeight = frame[1] * (role === "character" ? 0.78 : 0.56);
    const factor = Math.min(maxWidth / Math.max(1, sourceWidth), maxHeight / Math.max(1, sourceHeight));
    return [stableDimension(Math.max(0.5, sourceWidth * factor)), stableDimension(Math.max(0.5, sourceHeight * factor))];
}

function normalizeObject(value: unknown, index: number, aspectRatio: DirectorScene["aspectRatio"]): DirectorObject {
    const input = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<DirectorObject> : {};
    const requestedPrimitive = includes(PRIMITIVES, input.primitive) ? input.primitive : "box";
    const assetKind = input.assetKind === "image" || input.assetKind === "video" ? input.assetKind : requestedPrimitive === "image" || requestedPrimitive === "video" ? requestedPrimitive : undefined;
    const defaultRole: DirectorLayerRole = assetKind ? index === 0 ? "background" : "character" : requestedPrimitive === "character" ? "character" : "prop";
    const role = includes(LAYER_ROLES, input.role) ? input.role : defaultRole;
    const primitive = role === "character" && assetKind ? "character" : requestedPrimitive;
    const assetWidth = positiveNumber(input.assetWidth, 1024);
    const assetHeight = positiveNumber(input.assetHeight, 1024);
    const fallbackSize = directorAssetDisplaySize(role, aspectRatio, assetWidth, assetHeight);
    const displaySize: [number, number] = Array.isArray(input.displaySize) && input.displaySize.length >= 2
        ? [positiveNumber(input.displaySize[0], fallbackSize[0]), positiveNumber(input.displaySize[1], fallbackSize[1])]
        : fallbackSize;
    const fit = input.fit === "cover" || input.fit === "contain" ? input.fit : defaultDirectorAssetFit(role);
    return {
        ...input,
        id: stringValue(input.id, makeId("object")),
        name: stringValue(input.name, "未命名对象"),
        primitive,
        position: normalizeObjectPosition(input.position, role, assetKind),
        rotation: vectorValue(input.rotation, [0, 0, 0]),
        scale: vectorValue(input.scale, [1, 1, 1]),
        ...(assetKind ? { assetKind, assetWidth, assetHeight, displaySize, fit, backgroundProjection: input.backgroundProjection === "panorama" ? "panorama" as const : "backdrop" as const } : {}),
        ...(primitive === "character" ? { characterRig: normalizeCharacterRig(input.characterRig) } : {}),
        role,
        layerOrder: numberValue(input.layerOrder, (index + 1) * 10),
        opacity: clamp(numberValue(input.opacity, 1), 0, 1),
        color: /^#[0-9a-f]{6}$/i.test(String(input.color || "")) ? String(input.color) : "#e9583e",
        visible: input.visible !== false,
        locked: input.locked === true,
    };
}

function createCharacterRig(posePreset: Exclude<DirectorCharacterPosePreset, "custom"> = "stand"): DirectorCharacterRig {
    return { bodyPreset: "male", posePreset, height: 1, width: 1, joints: { ...ZERO_JOINTS(), ...POSE_JOINTS[posePreset] } };
}

function normalizeCharacterRig(value: unknown): DirectorCharacterRig {
    const input = value && typeof value === "object" ? value as Partial<DirectorCharacterRig> : {};
    const defaultRig = createCharacterRig();
    const rawJoints: Partial<Record<DirectorCharacterJoint, DirectorVector3>> = input.joints && typeof input.joints === "object" ? input.joints : {};
    const bodyPreset = includes(BODY_PRESETS, input.bodyPreset) ? input.bodyPreset : defaultRig.bodyPreset;
    const posePreset = includes(POSE_PRESETS, input.posePreset) ? input.posePreset : defaultRig.posePreset;
    const poseRig = posePreset === "custom" ? defaultRig : createCharacterRig(posePreset);
    return {
        bodyPreset,
        posePreset,
        height: clamp(numberValue(input.height, 1), 0.5, 1.8),
        width: clamp(numberValue(input.width, 1), 0.55, 1.8),
        joints: Object.fromEntries(CHARACTER_JOINTS.map((joint) => [joint, vectorValue(rawJoints[joint], poseRig.joints[joint])])) as Record<DirectorCharacterJoint, DirectorVector3>,
    };
}

function normalizeStage(value: unknown, fallback: DirectorScene["stage"]): DirectorScene["stage"] {
    const input = value && typeof value === "object" ? value as Partial<DirectorScene["stage"]> : {};
    return { showGrid: input.showGrid !== false, showGround: input.showGround !== false, showLabels: input.showLabels !== false, scenePosition: vectorValue(input.scenePosition, fallback.scenePosition), sceneRotation: vectorValue(input.sceneRotation, fallback.sceneRotation), sceneScale: clamp(numberValue(input.sceneScale, fallback.sceneScale), 0.1, 10), panoramaRotation: clamp(numberValue(input.panoramaRotation, fallback.panoramaRotation), -Math.PI * 2, Math.PI * 2), panoramaRadius: clamp(numberValue(input.panoramaRadius, fallback.panoramaRadius), 10, 100), ambientIntensity: clamp(numberValue(input.ambientIntensity, fallback.ambientIntensity), 0, 3) };
}

function normalizeObjectPosition(value: unknown, role: DirectorLayerRole, assetKind: DirectorObject["assetKind"]): DirectorVector3 {
    const position = vectorValue(value, role === "background" ? [0, 4, -8] : [0, 0, 0]);
    if (role === "background" && assetKind && position.every((item) => Math.abs(item) < 0.001)) return [0, 4, -8];
    if (role === "character" && position[1] < 0) return [position[0], 0, position[2]];
    return position;
}

function normalizeCamera(value: unknown): DirectorCamera {
    const input = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<DirectorCamera> : {};
    return { ...input, id: stringValue(input.id, makeId("camera")), name: stringValue(input.name, "未命名机位"), position: vectorValue(input.position, [6, 4, 8]), target: vectorValue(input.target, [0, 1, 0]), fov: clamp(numberValue(input.fov, 42), 15, 100) };
}

function normalizeShot(value: unknown, index: number, duration: number, cameraIds: Set<string>) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const input = value as Partial<DirectorScene["shots"][number]>;
    if (!cameraIds.has(String(input.cameraId || "")) || !includes(MOVEMENTS, input.movement)) return [];
    const start = clamp(numberValue(input.start, 0), 0, duration);
    const end = clamp(numberValue(input.end, duration), 0, duration);
    return end > start ? [{ ...input, id: stringValue(input.id, `shot-${index + 1}`), name: stringValue(input.name, "镜头"), cameraId: String(input.cameraId), movement: input.movement, start, end }] : [];
}

function normalizeKeyframe(value: unknown, duration: number, objectIds: Set<string>, cameraIds: Set<string>): DirectorKeyframe[] {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const input = value as Partial<DirectorKeyframe>;
    const targetId = String(input.targetId || "");
    const validTarget = input.targetType === "object" ? objectIds.has(targetId) : input.targetType === "camera" && cameraIds.has(targetId);
    if (!validTarget || !includes(KEYFRAME_PROPERTIES, input.property) || !Array.isArray(input.value) || !input.value.length) return [];
    const numbers = input.value.map(Number).filter(Number.isFinite).slice(0, 3);
    if ((input.property === "fov" && numbers.length !== 1) || (input.property !== "fov" && numbers.length !== 3)) return [];
    return [{ ...input, id: stringValue(input.id, makeId("key")), targetType: input.targetType!, targetId, property: input.property, time: clamp(numberValue(input.time, 0), 0, duration), value: numbers }];
}

function includes<const T extends readonly string[]>(values: T, value: unknown): value is T[number] { return values.includes(value as T[number]); }
function makeId(prefix: string) { return `${prefix}-${crypto.randomUUID()}`; }
function vectorValue(value: unknown, fallback: DirectorVector3): DirectorVector3 { return Array.isArray(value) && value.length >= 3 ? [numberValue(value[0], fallback[0]), numberValue(value[1], fallback[1]), numberValue(value[2], fallback[2])] : fallback; }
function positiveNumber(value: unknown, fallback: number) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : fallback; }
function numberValue(value: unknown, fallback: number) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function stringValue(value: unknown, fallback: string) { return typeof value === "string" && value.trim() ? value.trim() : fallback; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function stableDimension(value: number) { return Number(value.toFixed(6)); }
function formatVector(value: DirectorVector3) { return value.map((item) => Number(item.toFixed(2))).join(","); }
function formatNumber(value: number) { return Number(value.toFixed(2)); }
function formatTime(value: number) { return `${Number(value.toFixed(2))}s`; }
function movementLabel(value: DirectorScene["shots"][number]["movement"]) { return ({ static: "固定机位", "push-in": "缓慢推近", "pull-out": "缓慢拉远", "pan-left": "向左摇摄", "pan-right": "向右摇摄", orbit: "环绕主体", follow: "跟随主体" } as const)[value]; }
function environmentLabel(value: DirectorScene["environment"]) { return ({ studio: "摄影棚布光", courtyard: "东方院落", mountain: "山地云海", desert: "荒漠风沙", space: "太空场景" } as const)[value]; }
function posePresetLabel(value: DirectorCharacterPosePreset) { return ({ stand: "站立姿态", "t-pose": "T 型姿态", walk: "行走姿态", run: "跑步姿态", sit: "坐姿", crouch: "蹲姿", kneel: "单膝跪姿", "double-kneel": "双膝跪姿", fight: "格斗姿态", "hands-hips": "叉腰姿态", "hook-punch": "勾拳姿态", kick: "踢腿姿态", think: "思考姿态", "kick-ball": "踢球姿态", throw: "投掷姿态", bow: "鞠躬姿态", wave: "挥手姿态", "arms-crossed": "抱臂姿态", phone: "看手机姿态", point: "指向姿态", reach: "伸手姿态", custom: "自定义关节姿态" } as const)[value]; }
function bodyPresetLabel(value: DirectorCharacterRig["bodyPreset"]) { return ({ male: "男性", female: "女性", strong: "健壮", slim: "纤细", child: "少年", broad: "魁梧", teen: "青少年", chibi: "二头身" } as const)[value]; }
function jointLabel(value: DirectorCharacterJoint) { return ({ body: "躯干", head: "头部", leftUpperArm: "左上臂", leftForearm: "左前臂", rightUpperArm: "右上臂", rightForearm: "右前臂", leftThigh: "左大腿", leftCalf: "左小腿", rightThigh: "右大腿", rightCalf: "右小腿" } as const)[value]; }
function describeCharacterRig(rig: DirectorCharacterRig) {
    const joints = CHARACTER_JOINTS
        .filter((joint) => rig.joints[joint].some((value) => Math.abs(value) >= 0.04))
        .map((joint) => `${jointLabel(joint)}(${formatVector(rig.joints[joint])})`);
    const jointText = joints.length ? `，逐关节姿态：${joints.join("；")}` : "，全身自然放松、四肢垂直";
    return `${posePresetLabel(rig.posePreset)}，体型${bodyPresetLabel(rig.bodyPreset)}，身高比例${formatNumber(rig.height)}，体宽比例${formatNumber(rig.width)}${jointText}`;
}
